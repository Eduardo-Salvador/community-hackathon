import { chromium } from 'playwright-core';
import type { Config } from '../core/config.ts';
import type { BrowserProvider, RemoteBrowser } from './types.ts';

const API = 'https://api.browserbase.com/v1';

export class BrowserbaseError extends Error {
  constructor(public step: string, public status?: number) {
    super(`Browserbase falhou em ${step}${status ? ` (${status})` : ''}`);
  }
}

export function createBrowserbaseProvider(config: Config, fetchImpl: typeof fetch): BrowserProvider {
  const headers = { 'x-bb-api-key': config.browserbaseApiKey ?? '', 'content-type': 'application/json' };

  async function api<T>(step: string, path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, { ...init, headers });
    if (!res.ok) throw new BrowserbaseError(step, res.status);
    return (await res.json()) as T;
  }

  const release = (id: string) =>
    api('release', `/sessions/${id}`, {
      method: 'POST',
      body: JSON.stringify({ projectId: config.browserbaseProjectId, status: 'REQUEST_RELEASE' }),
    }).catch(() => {});

  return {
    async open(): Promise<RemoteBrowser> {
      const session = await api<{ id: string; connectUrl: string }>('create', '/sessions', {
        method: 'POST',
        body: JSON.stringify({
          projectId: config.browserbaseProjectId,
          timeout: config.browserTimeoutSec,
          // Login gov.br: nada de gravação/log com dados pessoais, e o captcha é do usuário.
          browserSettings: {
            recordSession: false,
            logSession: false,
            solveCaptchas: false,
            // Tela estreita: o gov.br usa o layout de celular e o live view fica legível no iframe do site.
            viewport: { width: 640, height: 800 },
          },
        }),
      });
      try {
        const browser = await chromium.connectOverCDP(session.connectUrl);
        const context = browser.contexts()[0] ?? (await browser.newContext());
        const page = context.pages()[0] ?? (await context.newPage());
        const live = await api<{ debuggerFullscreenUrl: string }>('live-view', `/sessions/${session.id}/debug`);
        return {
          id: session.id,
          liveViewUrl: live.debuggerFullscreenUrl,
          page,
          close: async () => {
            await browser.close().catch(() => {});
            await release(session.id);
          },
        };
      } catch (err) {
        await release(session.id);
        throw err;
      }
    },
  };
}
