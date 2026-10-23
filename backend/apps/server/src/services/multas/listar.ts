import type { IdentificadoresConsulta, ToolResults } from '@hackathon/contracts';
import type { z } from 'zod';
import { sleep, ToolError } from '../../core/errors.ts';
import { mapearMultasInfosimples } from '../../adapters/infosimples/mapper.ts';
import { calcularPontos, type MultaParaCalculo } from '../../domain/pontos/index.ts';
import { consultarApiComRetry, normalizarIdentificadores } from '../fallback.ts';
import type { ToolContext } from '../../tools/types.ts';
import { consultarMultasNoPortal } from './portal.ts';

type ListarMultasResult = z.infer<(typeof ToolResults)['listar_multas']>;

const MOCK_DATA_REFERENCIA = '2026-10-23';
const MOCK_MULTAS: MultaParaCalculo[] = [
  {
    id: 'm1',
    descricao: 'Avançar sinal vermelho',
    data: '2026-03-10',
    local: 'Av. Paulista, São Paulo',
    gravidade: 'gravissima',
    valor: 293.47,
    valorComDesconto: 176.08,
    prazoDesconto: '2026-11-10',
  },
  {
    id: 'm2',
    descricao: 'Velocidade até 20% acima',
    data: '2026-06-02',
    local: 'Marginal Tietê, São Paulo',
    gravidade: 'media',
    valor: 130.16,
  },
];

export async function listarMultas(
  ctx: ToolContext,
  entrada: IdentificadoresConsulta = {},
  dataReferencia?: string,
): Promise<ListarMultasResult> {
  let multasSemCalculo: MultaParaCalculo[];
  let ear: boolean;
  let referenciaCalculo = dataReferencia;

  const daExtensao = ctx.session.extensao?.multas;
  if (daExtensao) {
    // Dados reais enviados pela extensão do Chrome do usuário (tem prioridade, inclusive em mock).
    multasSemCalculo = daExtensao.multas;
    ear = daExtensao.ear;
    ctx.emit('dados_da_extensao', 'ok', { quantidade: multasSemCalculo.length });
  } else if (ctx.config.mock) {
    ctx.emit('carregando_mock', 'start');
    await sleep(200);
    multasSemCalculo = ctx.config.mockPerfil.multas ?? MOCK_MULTAS;
    ear = false;
    // Exemplo padrão usa data fixa; perfil personalizado (MOCK_PERFIL) usa a data de hoje.
    if (!ctx.config.mockPerfil.multas) referenciaCalculo ??= MOCK_DATA_REFERENCIA;
    ctx.emit('carregando_mock', 'ok', { quantidade: multasSemCalculo.length });
  } else {
    let portal: Awaited<ReturnType<typeof consultarMultasNoPortal>> | undefined;
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
        ctx.emit('extraindo_multas', 'start');
        try {
          portal = await consultarMultasNoPortal(page, ctx.extractor, ctx.config.senatranMultasUrl);
          ctx.emit('extraindo_multas', 'ok', { quantidade: portal.multas.length });
        } catch (error) {
          erroPortal = error;
          ctx.emit('extraindo_multas', 'error', { fallback: true });
        }
      }
    }

    if (portal) {
      multasSemCalculo = portal.multas;
      ear = portal.ear;
    } else {
      const identificadores = normalizarIdentificadores(entrada);
      if (!identificadores) {
        if (erroPortal) throw erroPortal;
        throw new ToolError(
          'IDENTIFIERS_REQUIRED',
          'Para consultar multas sem login, informe o CPF ou a placa junto com o RENAVAM',
        );
      }
      const raw = await consultarApiComRetry(ctx, () =>
        ctx.adapters.infosimples.consultarMultas(identificadores),
      );
      ctx.emit('mapeando_dados_api', 'start');
      try {
        multasSemCalculo = mapearMultasInfosimples(raw);
      } catch (error) {
        ctx.emit('mapeando_dados_api', 'error');
        throw error;
      }
      // A resposta de fallback não informa EAR; o limite conservador continua sendo calculado pelas infrações.
      ear = false;
      ctx.emit('mapeando_dados_api', 'ok', { quantidade: multasSemCalculo.length });
    }
  }

  ctx.emit('calculando_pontos', 'start');
  const resultado = calcularPontos(multasSemCalculo, ear, referenciaCalculo);
  ctx.session.profile.multas = resultado.multas;
  ctx.session.profile.pontos = resultado.pontos;
  ctx.emit('calculando_pontos', 'ok', resultado.pontos);
  return resultado;
}
