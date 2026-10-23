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
  assert.equal((await call(headers, 'listar_multas', { cpf: '123' })).statusCode, 400);
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

test('fluxo mock do Dev B respeita os contratos de saída', async () => {
  const headers = await newSession();
  await call(headers, 'selecionar_uf', { uf: 'SP' });
  await call(headers, 'iniciar_login');

  const multas = (await call(headers, 'listar_multas')).json();
  assert.equal(multas.ok, true);
  assert.equal(multas.result.pontos.total, 11);

  const guia = (await call(headers, 'gerar_guia_multa', { multaId: multas.result.multas[0].id })).json();
  assert.equal(guia.ok, true);
  assert.equal(guia.result.multaId, 'm1');
  assert.match(guia.result.pixCopiaECola, /^000201/);

  const guiaPdf = await app.inject({ method: 'GET', url: `/files/${guia.result.pdfFileId}`, headers });
  assert.equal(guiaPdf.statusCode, 200);
  assert.equal(guiaPdf.headers['content-type'], 'application/pdf');
  assert.equal(guiaPdf.body.slice(0, 5), '%PDF-');

  const veiculos = (await call(headers, 'consultar_veiculos')).json();
  assert.equal(veiculos.ok, true);
  assert.equal(veiculos.result.veiculos[0].placa, 'ABC1D23');
  const crlv = await app.inject({
    method: 'GET',
    url: `/files/${veiculos.result.veiculos[0].crlvFileId}`,
    headers,
  });
  assert.equal(crlv.statusCode, 200);
  assert.equal(crlv.headers['content-type'], 'application/pdf');
});

test('CORS ignora barra no final e aceita várias origens', async () => {
  const cors = await buildApp(loadConfig({ MOCK: '1', CORS_ORIGIN: 'https://site.vercel.app/, http://localhost:5173' }));
  const allow = async (origin: string) =>
    (await cors.inject({ method: 'OPTIONS', url: '/session', headers: { origin, 'access-control-request-method': 'POST' } }))
      .headers['access-control-allow-origin'];
  assert.equal(await allow('https://site.vercel.app'), 'https://site.vercel.app');
  assert.equal(await allow('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(await allow('https://outro.com'), undefined);
  await cors.close();
});
