import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';

let app: FastifyInstance;
let base: string;

before(async () => {
  app = await buildApp(loadConfig({ MOCK: '1', MCP_API_KEY: 'mcp-secret' }));
  base = await app.listen({ port: 0, host: '127.0.0.1' });
});
after(() => app.close());

async function connect(key = 'mcp-secret') {
  const client = new Client({ name: 'test-dots', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${key}` } },
  });
  await client.connect(transport);
  return client;
}

const json = (res: any) => JSON.parse(res.content.find((c: any) => c.type === 'text' && c.text.startsWith('{')).text);

test('/mcp exige a chave', async () => {
  await assert.rejects(connect('errada'));
  const res = await fetch(`${base}/mcp`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  assert.equal(res.status, 401);
});

test('lista as mesmas tools do registry + estado_sessao', async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'baixar_cnh',
    'consultar_cnh',
    'consultar_veiculos',
    'estado_sessao',
    'gerar_guia_multa',
    'iniciar_login',
    'listar_multas',
    'selecionar_uf',
  ]);
  assert.equal(tools.find((t) => t.name === 'selecionar_uf')!.inputSchema.required![0], 'uf');
  await client.close();
});

test('fluxo pelo MCP: erro com próximo passo, login, CNH e PDF embutido', async () => {
  const client = await connect();

  const blocked = await client.callTool({ name: 'consultar_cnh', arguments: {} });
  assert.equal(blocked.isError, true);
  assert.equal(json(blocked).next.tool, 'selecionar_uf');

  await client.callTool({ name: 'selecionar_uf', arguments: { uf: 'SP' } });
  await client.callTool({ name: 'iniciar_login', arguments: {} });
  const state = await client.callTool({ name: 'estado_sessao', arguments: {} });
  assert.equal((state.structuredContent as any).loggedIn, true);

  const cnh = await client.callTool({ name: 'consultar_cnh', arguments: {} });
  assert.equal((cnh.structuredContent as any).categoria, 'AB');

  const pdf = await client.callTool({ name: 'baixar_cnh', arguments: {} });
  const resource = (pdf.content as any[]).find((c) => c.type === 'resource').resource;
  assert.equal(resource.mimeType, 'application/pdf');
  assert.ok(Buffer.from(resource.blob, 'base64').toString().startsWith('%PDF'));

  const invalid = await client.callTool({ name: 'selecionar_uf', arguments: { uf: 'XX' } });
  assert.equal(invalid.isError, true);
  assert.equal(json(invalid).code, 'INVALID_INPUT');
  await client.close();
});

test('cada conexão MCP tem sua própria sessão', async () => {
  const a = await connect();
  const b = await connect();
  await a.callTool({ name: 'selecionar_uf', arguments: { uf: 'RJ' } });
  const stateB = await b.callTool({ name: 'estado_sessao', arguments: {} });
  assert.equal((stateB.structuredContent as any).uf, undefined);
  await a.close();
  await b.close();
});

test('sem MCP_API_KEY o /mcp não existe', async () => {
  const off = await buildApp(loadConfig({ MOCK: '1' }));
  assert.equal((await off.inject({ method: 'POST', url: '/mcp', payload: {} })).statusCode, 404);
  await off.close();
});
