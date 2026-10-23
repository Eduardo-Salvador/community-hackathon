import { z } from 'zod';

const PixSchema = z
  .object({
    qr_code: z.string().min(1),
    qr_code_url: z.url().optional(),
  })
  .passthrough();

const BoletoSchema = z
  .object({
    line: z.string().min(1),
    pdf: z.url().optional(),
  })
  .passthrough();

const TransacaoSchema = z
  .object({
    pix: PixSchema.nullish(),
    bank_slip: BoletoSchema.nullish(),
  })
  .passthrough();

export const ZapayPagamentoSchema = z
  .object({
    last_transaction: TransacaoSchema.nullish(),
  })
  .passthrough();

export const ZapayGuiaResponseSchema = z
  .object({
    order_id: z.string().optional(),
    charges: z.array(ZapayPagamentoSchema).optional(),
    items: z.array(ZapayPagamentoSchema).optional(),
  })
  .passthrough();
