import type { ToolResults } from '@hackathon/contracts';
import type { z } from 'zod';
import { sleep, ToolError } from '../../core/errors.ts';
import { calcularPontos, type MultaParaCalculo } from '../../domain/pontos/index.ts';
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
  dataReferencia?: string,
): Promise<ListarMultasResult> {
  if (!ctx.session.browser?.loggedIn) {
    throw new ToolError('LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
  }

  let multasSemCalculo: MultaParaCalculo[];
  let ear: boolean;
  let referenciaCalculo = dataReferencia;

  if (ctx.config.mock) {
    ctx.emit('carregando_mock', 'start');
    await sleep(200);
    multasSemCalculo = MOCK_MULTAS;
    ear = false;
    referenciaCalculo ??= MOCK_DATA_REFERENCIA;
    ctx.emit('carregando_mock', 'ok', { quantidade: multasSemCalculo.length });
  } else {
    ctx.emit('obtendo_pagina', 'start');
    const page = await ctx.getPage(ctx.session.id);
    if (!page) throw new ToolError('LOGIN_REQUIRED', 'Sessão do gov.br expirada; faça login novamente');
    ctx.emit('obtendo_pagina', 'ok');

    ctx.emit('extraindo_multas', 'start');
    const portal = await consultarMultasNoPortal(page, ctx.config.senatranMultasUrl);
    multasSemCalculo = portal.multas;
    ear = portal.ear;
    ctx.emit('extraindo_multas', 'ok', { quantidade: multasSemCalculo.length });
  }

  ctx.emit('calculando_pontos', 'start');
  const resultado = calcularPontos(multasSemCalculo, ear, referenciaCalculo);
  ctx.session.profile.multas = resultado.multas;
  ctx.session.profile.pontos = resultado.pontos;
  ctx.emit('calculando_pontos', 'ok', resultado.pontos);
  return resultado;
}
