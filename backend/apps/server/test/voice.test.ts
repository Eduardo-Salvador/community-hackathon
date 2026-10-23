import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';

async function setup(env: Record<string, string>, fetchImpl?: typeof fetch) {
  const config = { ...loadConfig({ MOCK: '1', ...env }), maxVoiceTokensPerSession: 2 };
  const app = await buildApp(config, { fetch: fetchImpl ?? globalThis.fetch });
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const voice = () =>
    app.inject({ method: 'POST', url: '/voice/token', headers: { ...headers, 'content-type': 'application/json' } });
  return { app, voice };
}

test('sem OPENAI_API_KEY responde 503', async () => {
  const { app, voice } = await setup({});
  const res = await voice();
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'VOICE_NOT_CONFIGURED');
  await app.close();
});

test('gera token com tools e instruções, e respeita o limite por sessão', async () => {
  let sent: any;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ value: 'ek_test', expires_at: 1_900_000_000 }), { status: 200 });
  }) as typeof fetch;
  const { app, voice } = await setup({ OPENAI_API_KEY: 'sk-test' }, fakeFetch);

  const res = await voice();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { token: 'ek_test', expiresAt: 1_900_000_000, model: 'gpt-realtime-2.1-mini' });
  assert.equal(sent.session.type, 'realtime');
  assert.ok(sent.session.instructions.includes('DADO'));
  assert.ok(sent.session.tools.some((t: any) => t.name === 'listar_multas' && t.type === 'function'));

  assert.equal((await voice()).statusCode, 200);
  assert.equal((await voice()).statusCode, 429);
  await app.close();
});

test('erro da OpenAI vira 502 sem vazar detalhes', async () => {
  const failing = (async () => new Response('{"error":"secret detail"}', { status: 401 })) as typeof fetch;
  const { app, voice } = await setup({ OPENAI_API_KEY: 'sk-test' }, failing);
  const res = await voice();
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.json(), { code: 'VOICE_UPSTREAM_ERROR' });
  await app.close();
});
