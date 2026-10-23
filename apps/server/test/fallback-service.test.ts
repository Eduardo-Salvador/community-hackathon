import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdapters } from '../src/adapters/index.ts';
import { loadConfig } from '../src/core/config.ts';
import { FileStore } from '../src/core/files.ts';
import type { Session } from '../src/core/session-store.ts';
import { listarMultas } from '../src/services/multas/listar.ts';
import { consultarVeiculos } from '../src/services/veiculo/consultar.ts';
import type { EmitStep, ToolContext } from '../src/tools/types.ts';

function criarContexto(
  fetchImpl: typeof fetch,
  page: unknown,
  loggedIn: boolean,
): { ctx: ToolContext; eventos: Array<{ step: string; status: string; data?: unknown }> } {
  const config = loadConfig({
    MOCK: '0',
    INFOSIMPLES_TOKEN: 'token-secreto',
    INFOSIMPLES_MULTAS_URL: 'https://api.infosimples.test/multas',
    INFOSIMPLES_VEICULO_URL: 'https://api.infosimples.test/veiculo',
  });
  const session: Session = {
    id: 'sessao-fallback',
    expiresAt: Date.now() + 60_000,
    uf: 'SP',
    browser: { sessionId: 'browser-fallback', liveViewUrl: 'about:blank', loggedIn },
    profile: {},
    voiceTokensIssued: 0,
  };
  const eventos: Array<{ step: string; status: string; data?: unknown }> = [];
  const emit: EmitStep = (step, status, data) => eventos.push({ step, status, data });
  return {
    ctx: {
      session,
      config,
      files: new FileStore(60_000),
      adapters: createAdapters(config, fetchImpl),
      getPage: async () => page,
      emit,
    },
    eventos,
  };
}

test('consulta multas pela Infosimples sem login usando CPF normalizado', async () => {
  let corpo: Record<string, unknown> | undefined;
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
    corpo = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        code: 200,
        data: [
          {
            auto_infracao: 'AIT-FALLBACK-1',
            descricao: 'Estacionar em local proibido',
            data_infracao: '10/03/2026',
            local: 'Av. Paulista',
            natureza: 'Média',
            normalizado_valor_multa: '130.16',
          },
        ],
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const { ctx, eventos } = criarContexto(fetchMock, undefined, false);

  const resultado = await listarMultas(ctx, { cpf: '123.456.789-00' }, '2026-10-23');

  assert.deepEqual(corpo, { cpf: '12345678900', token: 'token-secreto' });
  assert.equal(resultado.multas[0]?.id, 'AIT-FALLBACK-1');
  assert.equal(resultado.pontos.total, 4);
  assert.deepEqual(ctx.session.profile.multas, resultado.multas);
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    [
      'consultando_api_fallback:start',
      'consultando_api_fallback:ok',
      'mapeando_dados_api:start',
      'mapeando_dados_api:ok',
      'calculando_pontos:start',
      'calculando_pontos:ok',
    ],
  );
});

test('falha do portal aciona fallback de veículo e repete uma falha transitória', async () => {
  let chamadas = 0;
  let corpo: Record<string, unknown> | undefined;
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
    chamadas++;
    corpo = JSON.parse(String(init?.body));
    if (chamadas === 1) return new Response('indisponível', { status: 503 });
    return new Response(
      JSON.stringify({
        code: 200,
        data: [
          {
            veiculo: {
              placa: 'ABC-1D23',
              marca_modelo: 'VW GOL 1.0',
              licenciamento: { pago: true, vencimento: '31/10/2026' },
              restricoes: [],
              recall: [],
              crlv_file_id: 'id-externo-nao-deve-vazar',
            },
            ipva_em_aberto: 'R$ 0,00',
          },
        ],
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const page = { async extract() { throw new Error('portal fora do ar'); } };
  const { ctx, eventos } = criarContexto(fetchMock, page, true);

  const resultado = await consultarVeiculos(ctx, { placa: 'abc-1d23', renavam: '12345678901' });

  assert.equal(chamadas, 2);
  assert.deepEqual(corpo, {
    placa: 'ABC1D23',
    renavam: '12345678901',
    token: 'token-secreto',
  });
  assert.equal(resultado.veiculos[0]?.placa, 'ABC1D23');
  assert.equal(resultado.veiculos[0]?.crlvFileId, undefined);
  assert.deepEqual(ctx.session.profile.veiculos, resultado.veiculos);
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    [
      'obtendo_pagina:start',
      'obtendo_pagina:ok',
      'extraindo_veiculos:start',
      'extraindo_veiculos:error',
      'consultando_api_fallback:start',
      'consultando_api_fallback:error',
      'repetindo_consulta_api:start',
      'repetindo_consulta_api:ok',
      'mapeando_dados_api:start',
      'mapeando_dados_api:ok',
    ],
  );
});
