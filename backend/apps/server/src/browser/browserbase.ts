import { type Browser, chromium } from 'playwright-core';
import type { Config } from '../core/config.ts';
import type { BrowserProvider, RemoteBrowser } from './types.ts';

const API = 'https://api.browserbase.com/v1';

export class BrowserbaseError extends Error {
  constructor(public step: string, public status?: number, public detail?: string) {
    super(`Browserbase falhou em ${step}${status ? ` (${status})` : ''}${detail ? `: ${detail}` : ''}`);
  }
}

export function createBrowserbaseProvider(config: Config, fetchImpl: typeof fetch): BrowserProvider {
  const headers = { 'x-bb-api-key': config.browserbaseApiKey ?? '', 'content-type': 'application/json' };

  async function api<T>(step: string, path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, { ...init, headers });
    if (!res.ok) {
      // Motivo devolvido pela Browserbase (ex.: plano sem proxy), sem dados do usuário.
      const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      throw new BrowserbaseError(step, res.status, detail);
    }
    return (await res.json()) as T;
  }

  const release = (id: string) =>
    api('release', `/sessions/${id}`, {
      method: 'POST',
      body: JSON.stringify({ projectId: config.browserbaseProjectId, status: 'REQUEST_RELEASE' }),
    }).catch(() => {});

  return {
    async open(): Promise<RemoteBrowser> {
      const create = (opts: { proxyCountry?: string; verified?: boolean; keepAlive?: boolean }) =>
        api<{ id: string; connectUrl: string }>('create', '/sessions', {
          method: 'POST',
          body: JSON.stringify({
            projectId: config.browserbaseProjectId,
            timeout: config.browserTimeoutSec,
            // keepAlive: a sessão sobrevive enquanto o backend se desconecta durante o login.
            ...(opts.keepAlive ? { keepAlive: true } : {}),
            // IP residencial no Brasil: o hCaptcha do gov.br rejeita acessos de datacenter estrangeiro.
            ...(opts.proxyCountry ? { proxies: [{ type: 'browserbase', geolocation: { country: opts.proxyCountry } }] } : {}),
            // Login gov.br: nada de gravação/log com dados pessoais, e o captcha é do usuário.
            browserSettings: {
              recordSession: false,
              logSession: false,
              solveCaptchas: false,
              // Navegador "Verified": impressão digital de usuário real, para o gov.br não barrar como robô.
              ...(opts.verified ? { verified: true } : {}),
              // Tela estreita: o gov.br usa o layout de celular e o live view fica legível no iframe do site.
              viewport: { width: 640, height: 800 },
            },
          }),
        });
      // Do mais protegido ao mais simples: se o plano recusar um recurso, tenta sem ele.
      // O proxy BR é o que mais importa para o captcha: só desiste dele depois de tentá-lo sozinho.
      const attempts = [
        { proxyCountry: config.browserProxyCountry, verified: config.browserVerified, keepAlive: true },
        { proxyCountry: config.browserProxyCountry, keepAlive: true },
        { proxyCountry: config.browserProxyCountry },
        { keepAlive: true },
        {},
      ].filter((a, i, all) => all.findIndex((b) => JSON.stringify(b) === JSON.stringify(a)) === i);
      let session: { id: string; connectUrl: string } | undefined;
      let lastError: unknown;
      let keepAlive = false;
      let features: RemoteBrowser['features'] = { proxy: false, verified: false, keepAlive: false };
      for (const attempt of attempts) {
        try {
          session = await create(attempt);
          keepAlive = Boolean(attempt.keepAlive);
          features = { proxy: Boolean(attempt.proxyCountry), verified: Boolean(attempt.verified), keepAlive };
          break;
        } catch (err) {
          lastError = err;
          // Aparece nos logs do Render: diz por que a Browserbase recusou aquela combinação.
          console.warn('[browserbase] sessão recusada', JSON.stringify(attempt), String(err));
        }
      }
      if (!session) throw lastError;
      const { id, connectUrl } = session;
      const pageOf = async (b: Browser) => {
        const context = b.contexts()[0] ?? (await b.newContext());
        return context.pages()[0] ?? (await context.newPage());
      };
      try {
        let browser = await chromium.connectOverCDP(connectUrl);
        let attached = true;
        const live = await api<{ debuggerFullscreenUrl: string }>('live-view', `/sessions/${id}/debug`);
        const remote: RemoteBrowser = {
          id,
          liveViewUrl: live.debuggerFullscreenUrl,
          features,
          page: await pageOf(browser),
          close: async () => {
            if (attached) await browser.close().catch(() => {});
            await release(id);
          },
        };
        // Sem keepAlive, desconectar encerraria a sessão: aí o controle fica conectado o tempo todo.
        if (keepAlive) {
          remote.detach = async () => {
            if (!attached) return;
            attached = false;
            await browser.close().catch(() => {});
          };
          remote.attach = async () => {
            if (!attached) {
              browser = await chromium.connectOverCDP(connectUrl);
              attached = true;
            }
            remote.page = await pageOf(browser);
            return remote.page;
          };
          remote.currentUrl = async () => {
            const debug = await api<{ pages: Array<{ url: string }> }>('live-view', `/sessions/${id}/debug`);
            return debug.pages.map((p) => p.url).find((u) => u && u !== 'about:blank') ?? '';
          };
        }
        return remote;
      } catch (err) {
        await release(id);
        throw err;
      }
    },
  };
}
