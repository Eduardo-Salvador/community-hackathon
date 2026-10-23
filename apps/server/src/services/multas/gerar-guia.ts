import { GuiaSchema, type Guia, type Multa } from '@hackathon/contracts';
import { sleep, ToolError } from '../../core/errors.ts';
import type { ToolContext } from '../../tools/types.ts';
import { criarPdfGuia } from './pdf.ts';

const MOCK_PIX = '00020101021226800014br.gov.bcb.pix0136mock-guia-multa-devb5204000053039865802BR5908DETRANSP6009SAOPAULO62070503***6304ABCD';
const MOCK_LINHA = '34191.75462 24615.781234 41234.510000 3 83840000003090';

function hojeEmSaoPaulo(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const obter = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value;
  return `${obter('year')}-${obter('month')}-${obter('day')}`;
}

export function calcularPagamentoMulta(
  multa: Multa,
  dataReferencia = hojeEmSaoPaulo(),
): { valorCentavos: number; descontoSneAplicado: boolean } {
  const descontoSneAplicado =
    multa.valorComDesconto !== undefined &&
    multa.valorComDesconto <= multa.valor &&
    multa.prazoDesconto !== undefined &&
    multa.prazoDesconto >= dataReferencia;
  const valor = descontoSneAplicado ? multa.valorComDesconto! : multa.valor;
  return { valorCentavos: Math.round(valor * 100), descontoSneAplicado };
}

export async function gerarGuiaMulta(
  ctx: ToolContext,
  multaId: string,
  dataReferencia?: string,
): Promise<Guia> {
  ctx.emit('validando_multa', 'start');
  const multa = ctx.session.profile.multas?.find((item) => item.id === multaId);
  if (!multa) {
    ctx.emit('validando_multa', 'error');
    throw new ToolError('NOT_FOUND', 'Multa não encontrada; liste as multas antes');
  }
  ctx.emit('validando_multa', 'ok');

  ctx.emit('calculando_desconto_sne', 'start');
  const pagamento = calcularPagamentoMulta(multa, dataReferencia);
  ctx.emit('calculando_desconto_sne', 'ok', {
    aplicado: pagamento.descontoSneAplicado,
    valorCentavos: pagamento.valorCentavos,
    prazo: multa.prazoDesconto,
  });

  ctx.emit('gerando_pagamento', 'start');
  const resultado = ctx.config.mock
    ? await (async () => {
        await sleep(200);
        return {
          guia: { multaId, pixCopiaECola: MOCK_PIX, linhaDigitavel: MOCK_LINHA },
          pdfUrl: undefined,
        };
      })()
    : await ctx.adapters.zapay.gerarGuia({
        multaId,
        descricao: multa.descricao,
        ...pagamento,
      });
  ctx.emit('gerando_pagamento', 'ok', {
    pix: Boolean(resultado.guia.pixCopiaECola),
    boleto: Boolean(resultado.guia.linhaDigitavel),
  });

  ctx.emit('preparando_pdf', 'start');
  const pdf = resultado.pdfUrl
    ? await ctx.adapters.zapay.baixarPdf(resultado.pdfUrl)
    : criarPdfGuia({
        multaId,
        descricao: multa.descricao,
        ...pagamento,
        pixCopiaECola: resultado.guia.pixCopiaECola,
        linhaDigitavel: resultado.guia.linhaDigitavel,
      });
  const pdfFileId = ctx.files.put(ctx.session.id, {
    contentType: 'application/pdf',
    filename: 'guia-multa.pdf',
    body: pdf,
  });
  ctx.emit('preparando_pdf', 'ok');

  const guia = GuiaSchema.parse({ ...resultado.guia, pdfFileId });
  ctx.session.profile.guias ??= {};
  ctx.session.profile.guias[multaId] = guia;
  return guia;
}
