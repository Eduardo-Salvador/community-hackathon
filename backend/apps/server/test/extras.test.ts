import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdapters } from '../src/adapters/index.ts';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';
import { enriquecerRecall } from '../src/services/extras/index.ts';
import type { ToolContext } from '../src/tools/types.ts';

function fakeInfosimples(data: unknown[], calls: Array<{ url: string; body: any }> = []) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({ code: 200, data });
  }) as typeof fetch;
}

const veiculo = {
  placa: 'ABC1D23', modelo: 'VW GOL', licenciamento: { pago: true, vencimento: '2026-10-31' },
  ipvaEmAberto: 0, restricoes: [], recall: [],
};

test('recall da Infosimples entra no veículo e falha não derruba a consulta', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const config = loadConfig({ MOCK: '0', INFOSIMPLES_TOKEN: 'tk' });
  const fetchOk = fakeInfosimples([{ recalls_pendentes: [{ descricao: 'Troca do airbag\ndo motorista' }, 'Freio'] }], calls);
  const ctx = { config, adapters: createAdapters(config, fetchOk), emit: () => {} } as unknown as ToolContext;
  const [v] = await enriquecerRecall(ctx, [veiculo]);
  assert.deepEqual(v!.recall, ['Troca do airbag do motorista', 'Freio']);
  assert.equal(calls[0]!.url, 'https://api.infosimples.com/api/v2/consultas/senatran/recall');
  assert.deepEqual(calls[0]!.body, { placa: 'ABC1D23', token: 'tk' });

  const falha = (async () => new Response('x', { status: 500 })) as typeof fetch;
  const ctx2 = { config, adapters: createAdapters(config, falha), emit: () => {} } as unknown as ToolContext;
  assert.deepEqual(await enriquecerRecall(ctx2, [veiculo]), [veiculo]);

  const semToken = { config: loadConfig({ MOCK: '0' }), emit: () => {} } as unknown as ToolContext;
  assert.deepEqual(await enriquecerRecall(semToken, [veiculo]), [veiculo]);
});

test('consultar_toxicologico usa Infosimples sem senha e normaliza datas', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = fakeInfosimples(
    [{ data_coleta_amostra: '10/04/2025', prazo_novo_exame: '10/10/2027', observacao: 'Exame dentro do prazo' }],
    calls,
  );
  const app = await buildApp(loadConfig({ MOCK: '0', INFOSIMPLES_TOKEN: 'tk', DECISIONS: '0' }), { fetch: fetchImpl });
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const res = await app.inject({
    method: 'POST', url: '/tools/consultar_toxicologico', headers,
    payload: { cpf: '123.456.789-00', dataNascimento: '1990-05-20', validadeCnh: '2028-01-15' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().result, { dataColeta: '2025-04-10', prazoNovoExame: '2027-10-10', observacao: 'Exame dentro do prazo' });
  assert.equal(calls[0]!.url, 'https://api.infosimples.com/api/v2/consultas/senatran/exame-toxicologico');
  assert.deepEqual(calls[0]!.body, { cpf: '12345678900', birthdate: '20/05/1990', data_vencimento_cnh: '15/01/2028', token: 'tk' });

  const semValidade = await app.inject({
    method: 'POST', url: '/tools/consultar_toxicologico', headers, payload: { cpf: '12345678900', dataNascimento: '1990-05-20' },
  });
  assert.equal(semValidade.json().code, 'NOT_FOUND');
  await app.close();
});
