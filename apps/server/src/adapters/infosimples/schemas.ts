import { z } from 'zod';

export const InfosimplesEnvelopeSchema = z.object({
  code: z.number().int(),
  code_message: z.string().optional(),
  data: z.array(z.unknown()),
});

const textoOuNumero = z.union([z.string(), z.number()]);

export const InfosimplesMultaItemSchema = z
  .object({
    id: textoOuNumero.optional(),
    auto_infracao: textoOuNumero.optional(),
    numero_auto: textoOuNumero.optional(),
    renainf: textoOuNumero.optional(),
    descricao: z.string().optional(),
    data: z.string().optional(),
    data_infracao: z.string().optional(),
    local: z.string().optional(),
    gravidade: z.string().optional(),
    natureza: z.string().optional(),
    valor: textoOuNumero.optional(),
    valor_multa: textoOuNumero.optional(),
    normalizado_valor_multa: textoOuNumero.optional(),
    valor_com_desconto: textoOuNumero.optional(),
    prazo_desconto: z.string().optional(),
  })
  .passthrough();

const LicenciamentoSchema = z.object({
  pago: z.boolean(),
  vencimento: z.string(),
});

export const InfosimplesVeiculoItemSchema = z
  .object({
    veiculo: z
      .object({
        placa: z.string(),
        marca_modelo: z.string().optional(),
        modelo: z.string().optional(),
        licenciamento: LicenciamentoSchema.optional(),
        restricoes: z.array(z.string()).optional(),
        restricao: z.union([z.string(), z.array(z.string())]).optional(),
        recall: z.array(z.string()).optional(),
        crlv_file_id: z.string().optional(),
        ipva_em_aberto: textoOuNumero.optional(),
      })
      .passthrough(),
    ipva_em_aberto: textoOuNumero.optional(),
    licenciamento: LicenciamentoSchema.optional(),
    restricoes: z.array(z.string()).optional(),
    recall: z.array(z.string()).optional(),
    crlv_file_id: z.string().optional(),
  })
  .passthrough();
