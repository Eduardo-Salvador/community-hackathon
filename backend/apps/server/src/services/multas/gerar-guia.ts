import { GuiaSchema, type Guia, type Multa } from '@hackathon/contracts';
import { sleep, ToolError } from '../../core/errors.ts';
import { guiaShareText, pixQrCode } from '../../core/share.ts';
import type { ToolContext } from '../../tools/types.ts';
import { gerarGuiaNoPortal } from './guia-portal.ts';
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

  // Guia oficial vem do portal (login gov.br). Mock e GUIA_DEMO devolvem uma guia marcada como demonstração.
  const demonstracao = ctx.config.mock || ctx.config.guiaDemo;
  ctx.emit('gerando_pagamento', 'start', { fonte: demonstracao ? 'demonstracao' : 'portal' });
  let codigos: { pixCopiaECola?: string; linhaDigitavel?: string; pdf?: Buffer };
  if (demonstracao) {
    await sleep(200);
    codigos = { pixCopiaECola: MOCK_PIX, linhaDigitavel: MOCK_LINHA };
  } else {
    const page = ctx.browsers.getPage(ctx.session.id);
    if (!page) {
      ctx.emit('gerando_pagamento', 'error', { code: 'LOGIN_REQUIRED' });
      throw new ToolError('LOGIN_REQUIRED', 'A guia oficial é gerada no portal: faça login no gov.br');
    }
    if (!ctx.config.senatranMultasUrl) throw new ToolError('NOT_IMPLEMENTED', 'URL de multas do portal não configurada');
    codigos = await gerarGuiaNoPortal(page, ctx.extractor, multa, ctx.config.senatranMultasUrl);
  }
  const resultado = {
    guia: { multaId, pixCopiaECola: codigos.pixCopiaECola, linhaDigitavel: codigos.linhaDigitavel },
  };
  ctx.emit('gerando_pagamento', 'ok', {
    pix: Boolean(resultado.guia.pixCopiaECola),
    boleto: Boolean(resultado.guia.linhaDigitavel),
    demonstracao,
  });

  ctx.emit('preparando_pdf', 'start');
  const pdf =
    codigos.pdf ??
    criarPdfGuia({
      multaId,
      descricao: multa.descricao,
      ...pagamento,
      pixCopiaECola: resultado.guia.pixCopiaECola,
      linhaDigitavel: resultado.guia.linhaDigitavel,
      demonstracao,
    });
  const pdfFileId = ctx.files.put(ctx.session.id, {
    contentType: 'application/pdf',
    filename: 'guia-multa.pdf',
    title: `Guia da multa ${multa.id}`,
    body: pdf,
  });
  ctx.emit('preparando_pdf', 'ok');

  const pixCopiaECola = resultado.guia.pixCopiaECola;
  const guia = GuiaSchema.parse({
    ...resultado.guia,
    pdfFileId,
    pixQrCode: pixCopiaECola ? await pixQrCode(pixCopiaECola) : undefined,
    textoCompartilhar:
      (demonstracao ? 'DEMONSTRAÇÃO - NÃO PAGUE ESTE CÓDIGO\n' : '') +
      guiaShareText({
        descricao: multa.descricao,
        valor: pagamento.valorCentavos / 100,
        vencimento: multa.prazoDesconto,
        linhaDigitavel: resultado.guia.linhaDigitavel,
        pixCopiaECola,
      }),
    demonstracao,
  });
  ctx.session.profile.guias ??= {};
  ctx.session.profile.guias[multaId] = guia;
  return guia;
}
