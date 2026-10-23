import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { buildApp } from '../src/app.ts';
import { createBrowserbaseProvider } from '../src/browser/browserbase.ts';
import { isLoggedIn } from '../src/browser/manager.ts';
import type { BrowserProvider } from '../src/browser/types.ts';
import { loadConfig } from '../src/core/config.ts';

const PORTAL = 'https://portalservicos.senatran.serpro.gov.br/';
const SSO = 'https://sso.acesso.gov.br/login?client_id=portal';

// Página falsa: o portal redireciona para o SSO do gov.br até "logarmos".
function fakeProvider() {
  const state = { url: '', closed: 0, opened: 0 };
  const provider: BrowserProvider = {
    async open() {
      state.opened++;
      const page = {
        url: () => state.url,
        goto: async () => {
          state.url = SSO;
        },
      } as unknown as Page;
      return { id: `bb-${state.opened}`, liveViewUrl: 'https://live.test/view', page, close: async () => void state.closed++ };
    },
  };
  return { provider, state };
}

async function setup(browserProvider?: BrowserProvider, env: Record<string, string> = {}) {
  const config = { ...loadConfig({ MOCK: '0', ...env }), loginPollMs: 10, loginTimeoutMs: 150 };
  const app = await buildApp(config, { browserProvider });
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const call = (name: string, payload: object = {}) =>
    app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });
  const state = async () => (await app.inject({ method: 'GET', url: '/session/state', headers })).json();
  await call('selecionar_uf', { uf: 'SP' });
  return { app, call, state };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('isLoggedIn só aceita o portal depois de sair do SSO', () => {
  assert.equal(isLoggedIn(SSO, PORTAL), false);
  assert.equal(isLoggedIn('https://portalservicos.senatran.serpro.gov.br/#/home', PORTAL), true);
  assert.equal(isLoggedIn('https://evil.example/portalservicos.senatran.serpro.gov.br', PORTAL), false);
  assert.equal(isLoggedIn('not a url', PORTAL), false);
});

test('login real: devolve live view, espera o usuário e libera a sessão', async () => {
  const { provider, state: browser } = fakeProvider();
  const { app, call, state } = await setup(provider);

  const res = (await call('iniciar_login')).json();
  assert.deepEqual(res.result, { liveViewUrl: 'https://live.test/view', loggedIn: false });
  assert.equal((await state()).loggedIn, false);
  assert.equal((await call('consultar_cnh')).json().code, 'LOGIN_REQUIRED');

  await wait(30); // usuário fica no gov.br até concluir o login
  browser.url = 'https://portalservicos.senatran.serpro.gov.br/#/home';
  await wait(50);
  assert.equal((await state()).loggedIn, true);

  await app.close();
  assert.equal(browser.closed, 1, 'navegador fechado ao desligar o servidor');
});

test('login expira e fecha o navegador', async () => {
  const { provider, state: browser } = fakeProvider();
  const { app, call, state } = await setup(provider);
  await call('iniciar_login');
  await wait(250);
  assert.equal((await state()).loggedIn, false);
  assert.equal(browser.closed, 1);
  await app.close();
});

test('novo login fecha o navegador anterior', async () => {
  const { provider, state: browser } = fakeProvider();
  const { app, call } = await setup(provider);
  await call('iniciar_login');
  await call('iniciar_login');
  assert.equal(browser.opened, 2);
  assert.equal(browser.closed, 1);
  await app.close();
});

test('sem Browserbase configurado responde 501', async () => {
  const { app, call } = await setup();
  const res = await call('iniciar_login');
  assert.equal(res.statusCode, 501);
  assert.equal(res.json().code, 'NOT_IMPLEMENTED');
  await app.close();
});

test('Browserbase fora do ar vira 503 e pede sessão sem gravação nem captcha automático', async () => {
  let body: any;
  const failing = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  const config = loadConfig({ MOCK: '0', BROWSERBASE_API_KEY: 'bb', BROWSERBASE_PROJECT_ID: 'p' });
  const { app, call } = await setup(createBrowserbaseProvider(config, failing));
  const res = await call('iniciar_login');
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'BROWSER_UNAVAILABLE');
  assert.deepEqual(body.browserSettings, {
    recordSession: false,
    logSession: false,
    solveCaptchas: false,
    viewport: { width: 640, height: 800 },
  });
  await app.close();
});

test('home pública do portal não conta como login: precisa passar pelo gov.br', async () => {
  // Portal que nunca redireciona para o gov.br (ex.: abriu a home pública).
  const page = {
    url: () => 'https://portalservicos.senatran.serpro.gov.br/#/home',
    goto: async () => {},
  } as unknown as Page;
  const provider: BrowserProvider = {
    open: async () => ({ id: 'bb', liveViewUrl: 'https://live.test/view', page, close: async () => {} }),
  };
  const { app, call, state } = await setup(provider);
  await call('iniciar_login');
  await wait(60);
  assert.equal((await state()).loggedIn, false);
  await app.close();
});

test('sessão pede proxy residencial no Brasil e, se o plano recusar, tenta sem proxy', async () => {
  const bodies: any[] = [];
  const recusaProxy = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    return new Response('{}', { status: body.proxies ? 402 : 500 });
  }) as typeof fetch;
  const config = loadConfig({ MOCK: '0', BROWSERBASE_API_KEY: 'bb', BROWSERBASE_PROJECT_ID: 'p' });
  const { app, call } = await setup(createBrowserbaseProvider(config, recusaProxy));
  await call('iniciar_login');
  assert.deepEqual(bodies[0].proxies, [{ type: 'browserbase', geolocation: { country: 'BR' } }]);
  assert.equal(bodies[0].browserSettings.verified, true, 'primeira tentativa: proxy + Verified');
  assert.equal(bodies[1].browserSettings.verified, undefined, 'segunda: só proxy');
  assert.deepEqual(bodies[1].proxies, [{ type: 'browserbase', geolocation: { country: 'BR' } }]);
  assert.deepEqual(bodies[2].proxies, [{ type: 'browserbase', geolocation: { country: 'BR' } }], 'terceira: só proxy');
  assert.equal(bodies[2].keepAlive, undefined);
  assert.equal(bodies[3].proxies, undefined, 'quarta: sem proxy');
  await app.close();

  const off = loadConfig({ MOCK: '0', BROWSERBASE_API_KEY: 'bb', BROWSERBASE_PROJECT_ID: 'p', BROWSERBASE_PROXY: 'off' });
  assert.equal(off.browserProxyCountry, undefined);
});

test('keepAlive: solta o navegador durante o login, acompanha pela API e reconecta depois', async () => {
  const s = { apiUrl: 'https://sso.acesso.gov.br/login', detached: 0, attached: 0, pageUrlReads: 0 };
  const page = {
    url: () => {
      s.pageUrlReads++;
      return 'https://sso.acesso.gov.br/login';
    },
    goto: async () => {},
  } as unknown as Page;
  const provider: BrowserProvider = {
    open: async () => ({
      id: 'bb', liveViewUrl: 'https://live.test', page, close: async () => {},
      detach: async () => void s.detached++,
      attach: async () => (s.attached++, page),
      currentUrl: async () => s.apiUrl,
    }),
  };
  const { app, call, state } = await setup(provider);
  await call('iniciar_login');
  assert.equal(s.detached, 1, 'desconectou depois de abrir o gov.br');
  await wait(30);
  assert.equal(s.attached, 0, 'continua desconectado enquanto o usuário está no gov.br');
  s.apiUrl = 'https://portalservicos.senatran.serpro.gov.br/#/infracoes/consultar';
  await wait(40);
  assert.equal((await state()).loggedIn, true);
  assert.equal(s.attached, 1, 'reconectou depois do login');
  assert.equal(s.pageUrlReads, 0, 'nunca leu a URL pelo navegador durante o login');
  await app.close();
});
