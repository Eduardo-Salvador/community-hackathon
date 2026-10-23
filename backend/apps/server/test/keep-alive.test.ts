import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { buildApp } from '../src/app.ts';
import { BrowserManager } from '../src/browser/manager.ts';
import type { BrowserProvider } from '../src/browser/types.ts';
import { loadConfig } from '../src/core/config.ts';
import { startKeepAlive } from '../src/core/keep-alive.ts';
import type { Session } from '../src/core/session-store.ts';

const PORTAL = 'https://portalservicos.senatran.serpro.gov.br/#/home';
const SSO = 'https://sso.acesso.gov.br/login';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('keep-alive do servidor pinga a URL configurada', async () => {
  const hits: string[] = [];
  const fakeFetch = (async (url: string) => {
    hits.push(url);
    return new Response('{}');
  }) as typeof fetch;
  const stop = startKeepAlive('https://x.onrender.com/health', 10, fakeFetch);
  await wait(45);
  stop();
  assert.ok(hits.length >= 2);
  assert.ok(hits.every((u) => u === 'https://x.onrender.com/health'));
});

test('sem KEEP_ALIVE_URL o servidor não pinga nada', async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls++;
    return new Response('{}');
  }) as typeof fetch;
  const app = await buildApp({ ...loadConfig({ MOCK: '1' }), keepAliveIntervalMs: 5 }, { fetch: fakeFetch });
  await wait(30);
  await app.close();
  assert.equal(calls, 0);

  const on = await buildApp(
    { ...loadConfig({ MOCK: '1', KEEP_ALIVE_URL: 'https://x.onrender.com/health' }), keepAliveIntervalMs: 5 },
    { fetch: fakeFetch },
  );
  await wait(30);
  await on.close();
  assert.ok(calls >= 2);
});

// Navegador falso: goto cai no SSO; o teste "loga" trocando a URL; reload pode simular o gov.br deslogando.
function setup(portalKeepAliveMs = 20) {
  const s = { url: '', reloads: 0, closed: 0, logoutOnReload: false };
  const page = {
    url: () => s.url,
    goto: async () => void (s.url = SSO),
    reload: async () => {
      s.reloads++;
      if (s.logoutOnReload) s.url = SSO;
    },
  } as unknown as Page;
  const provider: BrowserProvider = {
    open: async () => ({ id: 'bb', liveViewUrl: 'https://live.test', page, close: async () => void s.closed++ }),
  };
  const config = { ...loadConfig({ MOCK: '0' }), loginPollMs: 5, portalKeepAliveMs };
  const manager = new BrowserManager(config, provider);
  const session = { id: 'sess', expiresAt: Date.now() + 60_000, profile: {}, voiceTokensIssued: 0, uf: 'SP' } as Session;
  const events: string[] = [];
  const emit = (step: string, status: string) => void events.push(`${step}:${status}`);
  return { s, manager, session, events, emit };
}

test('portal é recarregado enquanto a sessão está ativa e para ao fechar', async () => {
  const { s, manager, session, emit } = setup();
  await manager.startLogin(session, emit);
  await wait(20); // usuário fica no gov.br até concluir o login
  s.url = PORTAL;
  await wait(100);
  assert.ok(s.reloads >= 2, `reloads=${s.reloads}`);
  assert.equal(session.browser?.loggedIn, true);

  await manager.close(session.id);
  const after = s.reloads;
  await wait(60);
  assert.equal(s.reloads, after, 'parou de recarregar depois de fechar');
});

test('não recarrega enquanto uma tool está usando a página', async () => {
  // Intervalos maiores: timers do Windows têm ~15 ms de resolução.
  const { s, manager, session, emit } = setup(120);
  await manager.startLogin(session, emit);
  await wait(20); // usuário fica no gov.br até concluir o login
  s.url = PORTAL;
  await wait(30);
  manager.getPage(session.id);
  const busy = setInterval(() => manager.getPage(session.id), 5);
  await wait(400);
  clearInterval(busy);
  assert.equal(s.reloads, 0);
  await manager.close(session.id);
});

test('gov.br deslogou: avisa, marca deslogado e fecha o navegador', async () => {
  const { s, manager, session, events, emit } = setup();
  await manager.startLogin(session, emit);
  await wait(20); // usuário fica no gov.br até concluir o login
  s.url = PORTAL;
  await wait(15);
  s.logoutOnReload = true;
  await wait(80);
  assert.ok(events.includes('sessao_govbr:error'));
  assert.equal(session.browser, undefined);
  assert.equal(s.closed, 1);
  assert.equal(manager.getPage(session.id), undefined);
});
