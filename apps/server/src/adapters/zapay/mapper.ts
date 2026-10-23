import { GuiaSchema, type Guia } from '@hackathon/contracts';
import { AdapterError } from '../http/errors.ts';
import { ZapayGuiaResponseSchema } from './schemas.ts';

export type GuiaZapay = {
  guia: Guia;
  pdfUrl?: string;
};

export function mapearGuiaZapay(multaId: string, raw: unknown): GuiaZapay {
  const parsed = ZapayGuiaResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'Resposta de pagamento inválida na Zapay');
  }

  const pagamentos = [...(parsed.data.charges ?? []), ...(parsed.data.items ?? [])];
  const pix = pagamentos.find((item) => item.last_transaction?.pix)?.last_transaction?.pix;
  const boleto = pagamentos.find((item) => item.last_transaction?.bank_slip)?.last_transaction?.bank_slip;
  if (!pix && !boleto) {
    throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'Zapay não retornou Pix nem boleto');
  }

  const guia = GuiaSchema.safeParse({
    multaId,
    ...(pix ? { pixCopiaECola: pix.qr_code } : {}),
    ...(boleto ? { linhaDigitavel: boleto.line } : {}),
  });
  if (!guia.success) {
    throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'Guia da Zapay não corresponde ao contrato interno');
  }

  return { guia: guia.data, pdfUrl: boleto?.pdf };
}
