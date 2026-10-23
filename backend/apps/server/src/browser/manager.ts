import type { Page } from 'playwright-core';
import type { StepEvent } from '@hackathon/contracts';
import type { Config } from '../core/config.ts';
import { ToolError } from '../core/errors.ts';
import type { Session } from '../core/session-store.ts';
import { BrowserbaseError } from './browserbase.ts';
import type { BrowserProvider, RemoteBrowser } from './types.ts';

type Emit = (step: string, status: StepEvent['status'], data?: unknown) => void;

const GOVBR_SSO = /(^|\.)acesso\.gov\.br$/;

export function isGovBrSso(currentUrl: string): boolean {
  try {
    return GOVBR_SSO.test(new URL(currentUrl).hostname);
  } catch {
    return false;
  }
}

// Logado = saiu do SSO do gov.br e voltou para o portal configurado.
export function isLoggedIn(currentUrl: string, portalUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    return !GOVBR_SSO.test(current.hostname) && current.hostname === new URL(portalUrl).hostname;
  } catch {
    return false;
  }
}

// Um navegador remoto por sessão do usuário. Fecha sozinho no timeout do login ou quando a sessão expira.
export class BrowserManager {
  private browsers = new Map<string, RemoteBrowser>();
  private watchers = new Map<string, NodeJS.Timeout>();
  private keepers = new Map<string, NodeJS.Timeout>();
  private lastUsed = new Map<string, number>();

  constructor(private config: Config, private provider?: BrowserProvider) {}

  async startLogin(session: Session, emit: Emit): Promise<{ liveViewUrl: string; loggedIn: boolean }> {
    if (!this.provider) throw new ToolError('NOT_IMPLEMENTED', 'Browserbase não configurado');
    await this.close(session.id);

    emit('abrindo_navegador', 'start');
    let browser: RemoteBrowser;
    try {
      browser = await this.provider.open();
    } catch (err) {
      if (err instanceof BrowserbaseError) {
        emit('abrindo_navegador', 'error', { code: 'BROWSER_UNAVAILABLE' });
        throw new ToolError('BROWSER_UNAVAILABLE', 'Não foi possível abrir o navegador agora');
      }
      throw err;
    }
    this.browsers.set(session.id, browser);
    session.browser = { sessionId: browser.id, liveViewUrl: browser.liveViewUrl, loggedIn: false };
    emit('abrindo_navegador', 'ok');

    emit('abrindo_portal', 'start');
    await browser.page.goto(this.config.portalLoginUrl, { waitUntil: 'domcontentloaded' });
    // Solta o controle do navegador enquanto o usuário faz o login (captcha/QR não veem automação).
    await browser.detach?.();
    emit('abrindo_portal', 'ok');

    emit('aguardando_usuario', 'start', { liveViewUrl: browser.liveViewUrl });
    this.watchLogin(session, browser, emit);
    return { liveViewUrl: browser.liveViewUrl, loggedIn: false };
  }

  // Só entrega a página depois do login. É o que os serviços (CNH, multas, veículo) usam.
  getPage(sessionId: string): Page | undefined {
    const page = this.watchers.has(sessionId) ? undefined : this.browsers.get(sessionId)?.page;
    if (page) this.lastUsed.set(sessionId, Date.now());
    return page;
  }

  async close(sessionId: string) {
    clearInterval(this.watchers.get(sessionId));
    this.watchers.delete(sessionId);
    clearInterval(this.keepers.get(sessionId));
    this.keepers.delete(sessionId);
    this.lastUsed.delete(sessionId);
    const browser = this.browsers.get(sessionId);
    this.browsers.delete(sessionId);
    await browser?.close();
  }

  async closeAll() {
    await Promise.all([...this.browsers.keys()].map((id) => this.close(id)));
  }

  private watchLogin(session: Session, browser: RemoteBrowser, emit: Emit) {
    const deadline = Date.now() + this.config.loginTimeoutMs;
    // A home do portal é pública: só conta como logado depois de passar pelo gov.br e voltar.
    let passedSso = false;
    let checking = false;
    const timer = setInterval(async () => {
      if (this.browsers.get(session.id) !== browser) return clearInterval(timer);
      if (checking) return;
      checking = true;
      try {
        // Desconectado (keepAlive): lê a URL pela API, sem tocar no navegador.
        const url = browser.currentUrl ? await browser.currentUrl().catch(() => '') : browser.page.url();
        if (this.browsers.get(session.id) !== browser) return;
        if (isGovBrSso(url)) passedSso = true;
        if (passedSso && isLoggedIn(url, this.config.portalUrl)) {
          clearInterval(timer);
          await browser.attach?.();
          this.watchers.delete(session.id);
          if (session.browser) session.browser.loggedIn = true;
          emit('aguardando_usuario', 'ok');
          this.keepPortalAlive(session, browser, emit);
          return;
        }
      } finally {
        checking = false;
      }
      if (Date.now() > deadline) {
        emit('aguardando_usuario', 'error', { code: 'LOGIN_TIMEOUT' });
        session.browser = undefined;
        void this.close(session.id);
      }
    }, this.config.loginPollMs);
    this.watchers.set(session.id, timer);
  }

  // Recarrega o portal de tempos em tempos para o gov.br não deslogar enquanto a conversa está ativa.
  // Para sozinho quando a sessão expira (close). Se o gov.br deslogar mesmo assim, avisa e pede login de novo.
  private keepPortalAlive(session: Session, browser: RemoteBrowser, emit: Emit) {
    let running = false;
    const timer = setInterval(async () => {
      if (this.browsers.get(session.id) !== browser) return clearInterval(timer);
      // Uma tool usou a página há pouco: não recarrega no meio de uma consulta.
      const idle = Date.now() - (this.lastUsed.get(session.id) ?? 0);
      if (running || idle < this.config.portalKeepAliveMs / 2) return;
      running = true;
      try {
        await browser.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        if (this.browsers.get(session.id) === browser && !isLoggedIn(browser.page.url(), this.config.portalUrl)) {
          emit('sessao_govbr', 'error', { code: 'GOVBR_SESSION_EXPIRED' });
          session.browser = undefined;
          await this.close(session.id);
        }
      } finally {
        running = false;
      }
    }, this.config.portalKeepAliveMs);
    timer.unref();
    this.keepers.set(session.id, timer);
  }
}
