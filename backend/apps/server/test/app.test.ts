import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';

let app: FastifyInstance;

before(async () => {
  app = await buildApp(loadConfig({ MOCK: '1' }));
});
after(() => app.close());

async function newSession() {
  const res = await app.inject({ method: 'POST', url: '/session' });
  const { id, token } = res.json();
  return { 'x-session-id': id, authorization: `Bearer ${token}` };
}

const call = (headers: Record<string, string>, name: string, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });

test('rotas exigem o token secreto da sessão', async () => {
  const headers = await newSession();
  assert.equal((await call({}, 'selecionar_uf', { uf: 'SP' })).statusCode, 401);
  assert.equal((await call({ ...headers, authorization: 'Bearer errado' }, 'selecionar_uf', { uf: 'SP' })).statusCode, 401);
  assert.equal((await call(headers, 'selecionar_uf', { uf: 'SP' })).statusCode, 200);
});

test('Swagger expõe todas as tools e rotas', async () => {
  const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
  for (const path of ['/session', '/voice/token', '/files/{id}', '/tools/listar_multas', '/tools/consultar_cnh']) {
    assert.ok(doc.paths[path], `faltando ${path}`);
  }
  assert.equal((await app.inject({ method: 'GET', url: '/docs/' })).statusCode, 200);
});

test('valida a entrada das tools', async () => {
  const headers = await newSession();
  assert.equal((await call(headers, 'selecionar_uf', { uf: 'XX' })).statusCode, 400);
  assert.equal((await call(headers, 'nao_existe')).statusCode, 404);
});

test('fluxo mock: UF → login → CNH → PDF', async () => {
  const headers = await newSession();
  assert.equal((await call(headers, 'consultar_cnh')).json().code, 'UF_REQUIRED');
  assert.equal((await call(headers, 'iniciar_login')).json().code, 'UF_REQUIRED');
  await call(headers, 'selecionar_uf', { uf: 'SP' });
  assert.equal((await call(headers, 'consultar_cnh')).json().code, 'LOGIN_REQUIRED');
  assert.equal((await call(headers, 'iniciar_login')).statusCode, 200);
  assert.equal((await call(headers, 'consultar_cnh')).json().result.categoria, 'AB');

  const { fileId } = (await call(headers, 'baixar_cnh')).json().result;
  const own = await app.inject({ method: 'GET', url: `/files/${fileId}`, headers });
  assert.equal(own.statusCode, 200);
  assert.equal(own.headers['content-type'], 'application/pdf');

  const other = await newSession();
  assert.equal((await app.inject({ method: 'GET', url: `/files/${fileId}`, headers: other })).statusCode, 404);
});
