import type { ToolResults, Veiculo } from '@hackathon/contracts';
import type { z } from 'zod';
import { sleep, ToolError } from '../../core/errors.ts';
import type { ToolContext } from '../../tools/types.ts';
import { consultarVeiculosNoPortal } from './portal.ts';

type ConsultarVeiculosResult = z.infer<(typeof ToolResults)['consultar_veiculos']>;

const MOCK_VEICULOS: Array<Omit<Veiculo, 'crlvFileId'>> = [
  {
    placa: 'ABC1D23',
    modelo: 'VW GOL 1.0',
    licenciamento: { pago: false, vencimento: '2026-10-31' },
    ipvaEmAberto: 0,
    restricoes: [],
    recall: [],
  },
];

const MOCK_CRLV = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

export async function consultarVeiculos(ctx: ToolContext): Promise<ConsultarVeiculosResult> {
  if (!ctx.session.browser?.loggedIn) {
    throw new ToolError('LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
  }

  let veiculos: Veiculo[];
  if (ctx.config.mock) {
    ctx.emit('carregando_mock', 'start');
    await sleep(200);
    veiculos = MOCK_VEICULOS.map((veiculo) => ({ ...veiculo }));
    ctx.emit('carregando_mock', 'ok', { quantidade: veiculos.length });

    ctx.emit('preparando_crlv', 'start');
    veiculos = veiculos.map((veiculo) => ({
      ...veiculo,
      crlvFileId: ctx.files.put(ctx.session.id, {
        contentType: 'application/pdf',
        filename: 'crlv-e.pdf',
        body: MOCK_CRLV,
      }),
    }));
    ctx.emit('preparando_crlv', 'ok', { quantidade: veiculos.length });
  } else {
    ctx.emit('obtendo_pagina', 'start');
    const page = await ctx.getPage(ctx.session.id);
    if (!page) throw new ToolError('LOGIN_REQUIRED', 'Sessão do gov.br expirada; faça login novamente');
    ctx.emit('obtendo_pagina', 'ok');

    ctx.emit('extraindo_veiculos', 'start');
    veiculos = await consultarVeiculosNoPortal(page, ctx.config.senatranVeiculosUrl);
    ctx.emit('extraindo_veiculos', 'ok', { quantidade: veiculos.length });
  }

  ctx.session.profile.veiculos = veiculos;
  return { veiculos };
}
