import type { Page } from 'playwright-core';
import type { StepEvent } from '@hackathon/contracts';
import type { Config } from '../core/config.ts';
import { ToolError } from '../core/errors.ts';
import type { Session } from '../core/session-store.ts';
import { BrowserbaseError } from './browserbase.ts';
import type { BrowserProvider, RemoteBrowser } from './types.ts';

type Emit = (step: string, status: StepEvent['status'], data?: unknown) => void;

const GOVBR_SSO = /(^|\.)acesso\.gov\.br$/;

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
    await browser.page.goto(this.config.portalUrl, { waitUntil: 'domcontentloaded' });
    emit('abrindo_portal', 'ok');

    emit('aguardando_usuario', 'start', { liveViewUrl: browser.liveViewUrl });
    this.watchLogin(session, browser, emit);
    return { liveViewUrl: browser.liveViewUrl, loggedIn: false };
  }

  // Só entrega a página depois do login. É o que os serviços (CNH, multas, veículo) usam.
  getPage(sessionId: string): Page | undefined {
    return this.watchers.has(sessionId) ? undefined : this.browsers.get(sessionId)?.page;
  }

  async close(sessionId: string) {
    clearInterval(this.watchers.get(sessionId));
    this.watchers.delete(sessionId);
    const browser = this.browsers.get(sessionId);
    this.browsers.delete(sessionId);
    await browser?.close();
  }

  async closeAll() {
    await Promise.all([...this.browsers.keys()].map((id) => this.close(id)));
  }

  private watchLogin(session: Session, browser: RemoteBrowser, emit: Emit) {
    const deadline = Date.now() + this.config.loginTimeoutMs;
    const timer = setInterval(() => {
      if (this.browsers.get(session.id) !== browser) return clearInterval(timer);
      if (isLoggedIn(browser.page.url(), this.config.portalUrl)) {
        clearInterval(timer);
        this.watchers.delete(session.id);
        if (session.browser) session.browser.loggedIn = true;
        emit('aguardando_usuario', 'ok');
      } else if (Date.now() > deadline) {
        emit('aguardando_usuario', 'error', { code: 'LOGIN_TIMEOUT' });
        session.browser = undefined;
        void this.close(session.id);
      }
    }, this.config.loginPollMs);
    this.watchers.set(session.id, timer);
  }
}
