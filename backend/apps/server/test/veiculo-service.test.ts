import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdapters } from '../src/adapters/index.ts';
import { AdapterError } from '../src/adapters/http/errors.ts';
import { loadConfig } from '../src/core/config.ts';
import { ToolError } from '../src/core/errors.ts';
import { FileStore } from '../src/core/files.ts';
import type { Session } from '../src/core/session-store.ts';
import { UntrustedDataError } from '../src/core/untrusted.ts';
import { consultarVeiculos } from '../src/services/veiculo/consultar.ts';
import type { EmitStep, ToolContext } from '../src/tools/types.ts';

function criarSessao(loggedIn = true): Session {
  return {
    id: 'sessao-veiculos',
    expiresAt: Date.now() + 60_000,
    uf: 'SP',
    browser: { sessionId: 'browser-teste', liveViewUrl: 'about:blank', loggedIn },
    profile: {},
    voiceTokensIssued: 0,
  };
}

function criarContexto(
  page: unknown,
  options: { mock?: boolean; loggedIn?: boolean } = {},
): { ctx: ToolContext; eventos: Array<{ step: string; status: string; data?: unknown }> } {
  const config = loadConfig({
    MOCK: options.mock ? '1' : '0',
    SENATRAN_VEICULOS_URL: 'https://portalservicos.senatran.test/veiculos',
  });
  const eventos: Array<{ step: string; status: string; data?: unknown }> = [];
  const emit: EmitStep = (step, status, data) => eventos.push({ step, status, data });
  const browserPage = page
    ? { ...(page as object), locator: () => ({ innerText: async () => 'conteúdo da página' }) }
    : undefined;
  return {
    ctx: {
      session: criarSessao(options.loggedIn),
      config,
      files: new FileStore(60_000),
      adapters: createAdapters(config),
      browsers: { getPage: () => browserPage } as unknown as ToolContext['browsers'],
      extractor: {
        extract: async () => {
          const extraido = await (page as { extract: () => Promise<unknown> }).extract();
          return extraido && typeof extraido === 'object' && 'data' in extraido
            ? (extraido as { data: unknown }).data
            : extraido;
        },
      } as ToolContext['extractor'],
      emit,
    },
    eventos,
  };
}

test('consulta veículos no portal, emite etapas e atualiza a sessão', async () => {
  let urlNavegada: string | undefined;
  const page = {
    async goto(url: string) {
      urlNavegada = url;
    },
    async extract() {
      return {
        data: {
          veiculos: [
            {
              placa: 'ABC1D23',
              modelo: 'VW GOL 1.0',
              licenciamento: { pago: true, vencimento: '2026-10-31' },
              ipvaEmAberto: 0,
              restricoes: [],
              recall: ['Campanha de atualização do airbag'],
            },
          ],
        },
      };
    },
  };
  const { ctx, eventos } = criarContexto(page);

  const resultado = await consultarVeiculos(ctx);

  assert.equal(urlNavegada, 'https://portalservicos.senatran.test/veiculos');
  assert.equal(resultado.veiculos[0]?.placa, 'ABC1D23');
  assert.deepEqual(resultado.veiculos[0]?.recall, ['Campanha de atualização do airbag']);
  assert.deepEqual(ctx.session.profile.veiculos, resultado.veiculos);
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    [
      'obtendo_pagina:start',
      'obtendo_pagina:ok',
      'extraindo_veiculos:start',
      'extraindo_veiculos:ok',
    ],
  );
});

test('fluxo mock gera CRLV-e protegido pela sessão', async () => {
  const { ctx, eventos } = criarContexto(undefined, { mock: true });

  const resultado = await consultarVeiculos(ctx);

  const crlvFileId = resultado.veiculos[0]?.crlvFileId;
  assert.ok(crlvFileId);
  const crlv = ctx.files.get(crlvFileId, ctx.session.id);
  assert.equal(crlv?.contentType, 'application/pdf');
  assert.equal(crlv?.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal(ctx.files.get(crlvFileId, 'outra-sessao'), undefined);
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    [
      'carregando_mock:start',
      'carregando_mock:ok',
      'preparando_crlv:start',
      'preparando_crlv:ok',
    ],
  );
});

test('sem login exige identificadores e sessão de portal expirada solicita novo login', async () => {
  const semLogin = criarContexto({}, { loggedIn: false }).ctx;
  await assert.rejects(
    consultarVeiculos(semLogin),
    (error: unknown) => error instanceof ToolError && error.code === 'IDENTIFIERS_REQUIRED',
  );

  const semPagina = criarContexto(undefined).ctx;
  await assert.rejects(
    consultarVeiculos(semPagina),
    (error: unknown) => error instanceof ToolError && error.code === 'LOGIN_REQUIRED',
  );
});

test('rejeita extração de veículos fora do contrato', async () => {
  const page = {
    async extract() {
      return { data: { veiculos: [{ placa: 'placa-inválida' }] } };
    },
  };
  const { ctx } = criarContexto(page);
  ctx.config.senatranVeiculosUrl = undefined;

  await assert.rejects(consultarVeiculos(ctx), (error: unknown) => error instanceof UntrustedDataError);
});

test('falha inesperada do navegador vira erro recuperável do adapter', async () => {
  const page = {
    async extract() {
      throw new Error('detalhe interno do navegador');
    },
  };
  const { ctx } = criarContexto(page);
  ctx.config.senatranVeiculosUrl = undefined;

  await assert.rejects(
    consultarVeiculos(ctx),
    (error: unknown) =>
      error instanceof AdapterError && error.code === 'NETWORK' && error.options.retryable === true,
  );
});
