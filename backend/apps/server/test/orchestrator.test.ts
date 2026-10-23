import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';

async function setup(env: Record<string, string> = {}, fetchImpl?: typeof fetch) {
  const app = await buildApp(loadConfig({ MOCK: '1', ...env }), { fetch: fetchImpl ?? globalThis.fetch });
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const call = (name: string, payload: object = {}) =>
    app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });
  const state = async () => (await app.inject({ method: 'GET', url: '/session/state', headers })).json();
  return { app, call, state };
}

test('tool bloqueada devolve o próximo passo', async () => {
  const { app, call } = await setup();
  const noUf = (await call('listar_multas')).json();
  assert.equal(noUf.code, 'UF_REQUIRED');
  assert.equal(noUf.next.tool, 'selecionar_uf');

  await call('selecionar_uf', { uf: 'SP' });
  const noLogin = (await call('consultar_cnh')).json();
  assert.equal(noLogin.code, 'LOGIN_REQUIRED');
  assert.equal(noLogin.next.tool, 'iniciar_login');
  await app.close();
});

test('regras fixas sugerem a sequência UF → login → CNH → multas → veículos → done', async () => {
  const { app, call, state } = await setup();
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const { next } = await state();
    assert.equal(next.source, 'rules');
    seen.push(next.tool ?? next.action);
    if (next.action === 'done') break;
    await call(next.tool, next.tool === 'selecionar_uf' ? { uf: 'SP' } : {});
  }
  assert.deepEqual(seen, ['selecionar_uf', 'iniciar_login', 'consultar_cnh', 'listar_multas', 'consultar_veiculos', 'done']);
  await app.close();
});

const env = { OPENAI_API_KEY: 'sk-test' };
const answer = (choice: string, confidence: number) =>
  (async () => Response.json({ answers: [{ type: 'choice', name: 'next_step', choice, confidence }] })) as typeof fetch;

test('usa a Decisions API quando confiante e sem dados pessoais no pedido', async () => {
  let url = '';
  let sent: any;
  const decisions = (async (u: string, init: RequestInit) => {
    url = u;
    sent = JSON.parse(String(init.body));
    return Response.json({ answers: [{ type: 'choice', name: 'next_step', choice: 'listar_multas', confidence: 0.9 }] });
  }) as typeof fetch;
  const { app, call, state } = await setup(env, decisions);
  await call('selecionar_uf', { uf: 'SP' });
  await call('iniciar_login');
  await call('consultar_cnh');

  const { next } = await state();
  assert.equal(next.source, 'decisions');
  assert.equal(next.action, 'run_tool');
  assert.equal(next.tool, 'listar_multas');
  assert.equal(url, 'https://api.openai.com/v1/decisions');
  assert.equal(sent.model, 'gpt-6-luna');
  assert.equal(sent.questions[0].type, 'choice');
  assert.equal(JSON.stringify(sent).includes('MARIA'), false);
  await app.close();
});

test('Decisions não pode pular o login', async () => {
  const { app, call, state } = await setup(env, answer('consultar_cnh', 0.99));
  await call('selecionar_uf', { uf: 'SP' });
  const { next } = await state();
  assert.equal(next.source, 'rules');
  assert.equal(next.tool, 'iniciar_login');
  await app.close();
});

test('Decisions com erro, resposta inválida, confiança baixa, timeout ou desligada cai nas regras', async () => {
  const hang = ((_u: string, init: RequestInit) =>
    new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('timeout'))))) as typeof fetch;
  const cases: [Record<string, string>, typeof fetch][] = [
    [env, (async () => new Response('boom', { status: 500 })) as typeof fetch],
    [env, answer('voar', 0.99)],
    [env, answer('done', 0.3)],
    [env, hang],
    [{ ...env, DECISIONS: '0' }, answer('done', 0.99)],
    [{}, answer('done', 0.99)],
  ];
  // AbortSignal.timeout não segura o event loop; o servidor real segura, o teste precisa disso.
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    for (const [caseEnv, decisions] of cases) {
      const { app, state } = await setup(caseEnv, decisions);
      const { next } = await state();
      assert.equal(next.source, 'rules');
      assert.equal(next.tool, 'selecionar_uf');
      await app.close();
    }
  } finally {
    clearInterval(keepAlive);
  }
});
