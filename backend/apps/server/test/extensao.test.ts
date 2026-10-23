import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';
import { tipoDaPagina } from '../src/services/extensao/index.ts';

const PORTAL = 'https://portalservicos.senatran.serpro.gov.br/';

// OpenAI falsa: responde conforme a tela que está sendo extraída.
const fakeOpenAI = (async (_u: string, init: RequestInit) => {
  const name = JSON.parse(String(init.body)).text.format.name;
  const data =
    name === 'cnh'
      ? { encontrado: true, nome: 'JOAO REAL', registro: '98765432100', categoria: 'b', validade: '2031-01-10', situacao: 'regular' }
      : name === 'multas_portal'
        ? { ear: false, multas: [{ id: 'x1', descricao: 'Estacionar em local proibido', data: '2026-09-01', local: 'Rua A', gravidade: 'media', valor: 130.16 }] }
        : { veiculos: [] };
  return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
}) as typeof fetch;

async function setup(mock = '0') {
  const app = await buildApp(loadConfig({ MOCK: mock, OPENAI_API_KEY: 'sk', DECISIONS: '0' }), { fetch: fakeOpenAI });
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const call = (name: string, payload: object = {}) => app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });
  return { app, call };
}

test('tipoDaPagina só aceita telas do portal oficial', () => {
  assert.equal(tipoDaPagina(`${PORTAL}#/habilitacao/consultar`, PORTAL), 'cnh');
  assert.equal(tipoDaPagina(`${PORTAL}#/infracoes/consultar`, PORTAL), 'multas');
  assert.equal(tipoDaPagina(`${PORTAL}#/veiculos/meus-veiculos`, PORTAL), 'veiculos');
  assert.equal(tipoDaPagina(`${PORTAL}#/home`, PORTAL), undefined);
  assert.equal(tipoDaPagina('https://evil.example/#/habilitacao', PORTAL), undefined);
});

test('extensão pareada manda telas e os dados reais aparecem (MOCK=0)', async () => {
  const { app, call } = await setup();
  await call('selecionar_uf', { uf: 'SP' });
  const { codigo } = (await call('conectar_extensao')).json().result;
  assert.match(codigo, /^[A-Z0-9]{6}$/);

  assert.equal((await app.inject({ method: 'POST', url: '/extension/claim', payload: { codigo: 'ZZZZZZ' } })).statusCode, 404);
  const claim = await app.inject({ method: 'POST', url: '/extension/claim', payload: { codigo: codigo.toLowerCase() } });
  assert.equal(claim.statusCode, 200);
  const ext = { authorization: `Bearer ${claim.json().token}` };
  assert.equal((await app.inject({ method: 'POST', url: '/extension/claim', payload: { codigo } })).statusCode, 404, 'código é de uso único');

  const page = (url: string, texto = 'texto da tela') =>
    app.inject({ method: 'POST', url: '/extension/page', headers: ext, payload: { url, texto } });
  assert.equal((await page(`${PORTAL}#/habilitacao/consultar`)).json().tipo, 'cnh');
  assert.equal((await page(`${PORTAL}#/infracoes/consultar`)).json().quantidade, 1);
  assert.equal((await page(`${PORTAL}#/home`)).json().ignorada, true);

  const cnh = (await call('consultar_cnh')).json().result;
  assert.equal(cnh.nome, 'JOAO REAL', 'dados reais da extensão');
  const multas = (await call('listar_multas')).json().result;
  assert.equal(multas.multas[0].id, 'x1');
  assert.equal(multas.pontos.total, 4);

  assert.equal((await app.inject({ method: 'POST', url: '/extension/page', payload: { url: PORTAL } })).statusCode, 401);
  await app.close();
});

test('com a extensão conectada, iniciar_login não abre navegador e conclui quando a extensão sincroniza', async () => {
  const app = await buildApp(
    { ...loadConfig({ MOCK: '0', OPENAI_API_KEY: 'sk', DECISIONS: '0' }), loginPollMs: 5 },
    { fetch: fakeOpenAI, browserProvider: { open: async () => { throw new Error('não deveria abrir navegador'); } } },
  );
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const call = (name: string, payload: object = {}) => app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });
  await call('selecionar_uf', { uf: 'SP' });
  const { codigo } = (await call('conectar_extensao')).json().result;
  const ext = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/extension/claim', payload: { codigo } })).json().token}` };

  const login = (await call('iniciar_login')).json();
  assert.deepEqual(login.result, { liveViewUrl: '', loggedIn: false });

  await app.inject({ method: 'POST', url: '/extension/page', headers: ext, payload: { url: `${PORTAL}#/habilitacao/detalhes/1/2`, texto: 'detalhe' } });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await app.inject({ method: 'GET', url: '/session/state', headers })).json().loggedIn, true);
  assert.equal((await call('consultar_cnh')).json().result.nome, 'JOAO REAL');
  await app.close();
});

test('com MOCK=1 o mock tem prioridade sobre os dados da extensão', async () => {
  const { app, call } = await setup('1');
  await call('selecionar_uf', { uf: 'SP' });
  const { codigo } = (await call('conectar_extensao')).json().result;
  const ext = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/extension/claim', payload: { codigo } })).json().token}` };
  await app.inject({ method: 'POST', url: '/extension/page', headers: ext, payload: { url: `${PORTAL}#/habilitacao/detalhes/1/2`, texto: 'x' } });
  assert.equal((await call('iniciar_login')).json().result.liveViewUrl, 'about:blank', 'login simulado do mock');
  assert.notEqual((await call('consultar_cnh')).json().result.nome, 'JOAO REAL');
  await app.close();
});
