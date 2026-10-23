import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Multa } from '@hackathon/contracts';
import { createAdapters } from '../src/adapters/index.ts';
import { AdapterError } from '../src/adapters/http/errors.ts';
import { loadConfig } from '../src/core/config.ts';
import { ToolError } from '../src/core/errors.ts';
import { FileStore } from '../src/core/files.ts';
import type { Session } from '../src/core/session-store.ts';
import { UntrustedDataError } from '../src/core/untrusted.ts';
import { calcularPagamentoMulta, gerarGuiaMulta } from '../src/services/multas/gerar-guia.ts';
import { listarMultas } from '../src/services/multas/listar.ts';
import type { EmitStep, ToolContext } from '../src/tools/types.ts';

function criarSessao(loggedIn = true): Session {
  return {
    id: 'sessao-teste',
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
    SENATRAN_MULTAS_URL: 'https://portalservicos.senatran.test/infracoes',
  });
  const eventos: Array<{ step: string; status: string; data?: unknown }> = [];
  const emit: EmitStep = (step, status, data) => eventos.push({ step, status, data });
  return {
    ctx: {
      session: criarSessao(options.loggedIn),
      config,
      files: new FileStore(60_000),
      adapters: createAdapters(config),
      getPage: async () => page,
      emit,
    },
    eventos,
  };
}

test('consulta multas no portal, calcula pontos, emite etapas e atualiza a sessão', async () => {
  let urlNavegada: string | undefined;
  const page = {
    async goto(url: string) {
      urlNavegada = url;
    },
    async extract() {
      return {
        data: {
          ear: false,
          multas: [
            {
              id: 'ait-1',
              descricao: 'Avançar sinal vermelho',
              data: '2026-03-10',
              local: 'Av. Paulista',
              gravidade: 'gravissima',
              valor: 293.47,
              valorComDesconto: 176.08,
              prazoDesconto: '2026-11-10',
            },
            {
              id: 'ait-2',
              descricao: 'Velocidade até 20% acima',
              data: '2026-06-02',
              local: 'Marginal Tietê',
              gravidade: 'media',
              valor: 130.16,
            },
          ],
        },
      };
    },
  };
  const { ctx, eventos } = criarContexto(page);

  const resultado = await listarMultas(ctx, '2026-10-23');

  assert.equal(urlNavegada, 'https://portalservicos.senatran.test/infracoes');
  assert.equal(resultado.pontos.total, 11);
  assert.equal(resultado.pontos.limite, 30);
  assert.equal(resultado.multas[0]?.pontos, 7);
  assert.equal(resultado.multas[0]?.expiraContagemEm, '2027-03-10');
  assert.deepEqual(ctx.session.profile.multas, resultado.multas);
  assert.deepEqual(ctx.session.profile.pontos, resultado.pontos);
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    [
      'obtendo_pagina:start',
      'obtendo_pagina:ok',
      'extraindo_multas:start',
      'extraindo_multas:ok',
      'calculando_pontos:start',
      'calculando_pontos:ok',
    ],
  );
});

test('respeita EAR extraído do portal', async () => {
  const page = {
    async extract() {
      return {
        ear: true,
        multas: [
          {
            id: 'g1',
            descricao: 'Infração gravíssima 1',
            data: '2026-09-01',
            local: 'São Paulo',
            gravidade: 'gravissima',
            valor: 293.47,
          },
          {
            id: 'g2',
            descricao: 'Infração gravíssima 2',
            data: '2026-09-02',
            local: 'São Paulo',
            gravidade: 'gravissima',
            valor: 293.47,
          },
        ],
      };
    },
  };
  const { ctx } = criarContexto(page);
  ctx.config.senatranMultasUrl = undefined;

  const resultado = await listarMultas(ctx, '2026-10-23');

  assert.equal(resultado.pontos.total, 14);
  assert.equal(resultado.pontos.limite, 40);
});

test('sessão ausente ou expirada solicita novo login', async () => {
  const semLogin = criarContexto({}, { loggedIn: false }).ctx;
  await assert.rejects(
    listarMultas(semLogin),
    (error: unknown) => error instanceof ToolError && error.code === 'LOGIN_REQUIRED',
  );

  const semPagina = criarContexto(undefined).ctx;
  await assert.rejects(
    listarMultas(semPagina),
    (error: unknown) => error instanceof ToolError && error.code === 'LOGIN_REQUIRED',
  );
});

test('rejeita extração do portal fora do contrato', async () => {
  const page = {
    async extract() {
      return { data: { ear: false, multas: [{ descricao: 'sem campos obrigatórios' }] } };
    },
  };
  const { ctx } = criarContexto(page);
  ctx.config.senatranMultasUrl = undefined;

  await assert.rejects(listarMultas(ctx), (error: unknown) => error instanceof UntrustedDataError);
});

test('falha inesperada do navegador vira erro recuperável do adapter', async () => {
  const page = {
    async extract() {
      throw new Error('detalhe interno do navegador');
    },
  };
  const { ctx } = criarContexto(page);
  ctx.config.senatranMultasUrl = undefined;

  await assert.rejects(
    listarMultas(ctx),
    (error: unknown) =>
      error instanceof AdapterError && error.code === 'NETWORK' && error.options.retryable === true,
  );
});

test('fluxo mock também usa o domínio de pontos', async () => {
  const { ctx, eventos } = criarContexto(undefined, { mock: true });

  const resultado = await listarMultas(ctx);

  assert.equal(resultado.pontos.total, 11);
  assert.equal(resultado.pontos.limite, 30);
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    ['carregando_mock:start', 'carregando_mock:ok', 'calculando_pontos:start', 'calculando_pontos:ok'],
  );
});

const MULTA_COM_DESCONTO: Multa = {
  id: 'm1',
  descricao: 'Avançar sinal vermelho',
  data: '2026-03-10',
  local: 'Av. Paulista',
  gravidade: 'gravissima',
  pontos: 7,
  valor: 293.47,
  valorComDesconto: 176.08,
  prazoDesconto: '2026-11-10',
  expiraContagemEm: '2027-03-10',
};

test('guia aplica o desconto SNE apenas dentro do prazo', () => {
  assert.deepEqual(calcularPagamentoMulta(MULTA_COM_DESCONTO, '2026-10-23'), {
    valorCentavos: 17608,
    descontoSneAplicado: true,
  });
  assert.deepEqual(calcularPagamentoMulta(MULTA_COM_DESCONTO, '2026-11-11'), {
    valorCentavos: 29347,
    descontoSneAplicado: false,
  });
});

test('gera Pix e PDF mock, emite etapas e guarda a guia na sessão', async () => {
  const { ctx, eventos } = criarContexto(undefined, { mock: true });
  ctx.session.profile.multas = [MULTA_COM_DESCONTO];

  const guia = await gerarGuiaMulta(ctx, 'm1', '2026-10-23');

  assert.match(guia.pixCopiaECola ?? '', /^000201/);
  assert.ok(guia.linhaDigitavel);
  assert.ok(guia.pdfFileId);
  assert.equal(ctx.session.profile.guias?.m1, guia);
  const pdf = ctx.files.get(guia.pdfFileId!, ctx.session.id);
  assert.equal(pdf?.contentType, 'application/pdf');
  assert.equal(pdf?.body.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(
    eventos.map(({ step, status }) => `${step}:${status}`),
    [
      'validando_multa:start',
      'validando_multa:ok',
      'calculando_desconto_sne:start',
      'calculando_desconto_sne:ok',
      'gerando_pagamento:start',
      'gerando_pagamento:ok',
      'preparando_pdf:start',
      'preparando_pdf:ok',
    ],
  );
});

test('não gera guia para multa que não foi consultada', async () => {
  const { ctx } = criarContexto(undefined, { mock: true });
  await assert.rejects(
    gerarGuiaMulta(ctx, 'inexistente'),
    (error: unknown) => error instanceof ToolError && error.code === 'NOT_FOUND',
  );
});
