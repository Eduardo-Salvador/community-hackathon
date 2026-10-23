import type { IdentificadoresConsulta, ToolResults, Veiculo } from '@hackathon/contracts';
import type { z } from 'zod';
import { sleep, ToolError } from '../../core/errors.ts';
import { mapearVeiculoInfosimples } from '../../adapters/infosimples/mapper.ts';
import { consultarApiComRetry, normalizarIdentificadores } from '../fallback.ts';
import type { ToolContext } from '../../tools/types.ts';
import { consultarVeiculosNoPortal } from './portal.ts';
import { enriquecerRecall } from '../extras/index.ts';

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

export async function consultarVeiculos(
  ctx: ToolContext,
  entrada: IdentificadoresConsulta = {},
): Promise<ConsultarVeiculosResult> {
  let veiculos: Veiculo[];
  // Dados reais enviados pela extensão do Chrome do usuário. Com MOCK=1, o mock tem prioridade.
  const daExtensao = ctx.config.mock ? undefined : ctx.session.extensao?.veiculos;
  if (daExtensao) {
    veiculos = daExtensao.map((veiculo) => ({ ...veiculo }));
    ctx.emit('dados_da_extensao', 'ok', { quantidade: veiculos.length });
  } else if (ctx.config.mock) {
    ctx.emit('carregando_mock', 'start');
    await sleep(200);
    veiculos = (ctx.config.mockPerfil.veiculos ?? MOCK_VEICULOS).map((veiculo) => ({ ...veiculo }));
    ctx.emit('carregando_mock', 'ok', { quantidade: veiculos.length });

    ctx.emit('preparando_crlv', 'start');
    veiculos = veiculos.map((veiculo) => ({
      ...veiculo,
      crlvFileId: ctx.files.put(ctx.session.id, {
        contentType: 'application/pdf',
        filename: 'crlv-e.pdf',
        title: `CRLV-e ${veiculo.placa}`,
        body: MOCK_CRLV,
      }),
    }));
    ctx.emit('preparando_crlv', 'ok', { quantidade: veiculos.length });
  } else {
    let veiculosPortal: Veiculo[] | undefined;
    let erroPortal: unknown;
    if (ctx.session.browser?.loggedIn) {
      ctx.emit('obtendo_pagina', 'start');
      let page: ReturnType<ToolContext['browsers']['getPage']>;
      try {
        page = ctx.browsers.getPage(ctx.session.id);
        if (!page) throw new ToolError('LOGIN_REQUIRED', 'Sessão do gov.br expirada');
        ctx.emit('obtendo_pagina', 'ok');
      } catch (error) {
        erroPortal = error;
        ctx.emit('obtendo_pagina', 'error', { fallback: true });
      }

      if (page) {
        ctx.emit('extraindo_veiculos', 'start');
        try {
          veiculosPortal = await consultarVeiculosNoPortal(page, ctx.extractor, ctx.config.senatranVeiculosUrl);
          ctx.emit('extraindo_veiculos', 'ok', { quantidade: veiculosPortal.length });
        } catch (error) {
          erroPortal = error;
          ctx.emit('extraindo_veiculos', 'error', { fallback: true });
        }
      }
    }

    if (veiculosPortal) {
      veiculos = veiculosPortal;
    } else {
      const identificadores = normalizarIdentificadores(entrada);
      if (!identificadores) {
        if (erroPortal) throw erroPortal;
        throw new ToolError(
          'IDENTIFIERS_REQUIRED',
          'Para consultar veículos sem login, informe o CPF ou a placa junto com o RENAVAM',
        );
      }
      const raw = await consultarApiComRetry(ctx, () =>
        ctx.adapters.infosimples.consultarVeiculo(identificadores),
      );
      ctx.emit('mapeando_dados_api', 'start');
      try {
        veiculos = raw.map(mapearVeiculoInfosimples);
      } catch (error) {
        ctx.emit('mapeando_dados_api', 'error');
        throw error;
      }
      ctx.emit('mapeando_dados_api', 'ok', { quantidade: veiculos.length });
    }
  }

  veiculos = await enriquecerRecall(ctx, veiculos);
  ctx.session.profile.veiculos = veiculos;
  return { veiculos };
}
