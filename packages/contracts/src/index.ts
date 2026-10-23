import { z } from 'zod';

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export const UFSchema = z.enum(UFS);
export type UF = z.infer<typeof UFSchema>;

// Datas sempre em ISO (YYYY-MM-DD).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Texto vindo do portal: limitado e sem caracteres de controle.
const text = (max = 200) => z.string().max(max).regex(/^[^\u0000-\u001f\u007f]*$/);

export const CnhSchema = z.object({
  nome: text(),
  registro: z.string().regex(/^\d{9,11}$/),
  categoria: z.string().regex(/^(ACC|A|B|C|D|E|AB|AC|AD|AE)$/),
  validade: isoDate,
  situacao: z.enum(['regular', 'suspensa', 'cassada', 'vencida']),
  pdfFileId: z.string().optional(),
});
export type Cnh = z.infer<typeof CnhSchema>;

export const GravidadeSchema = z.enum(['leve', 'media', 'grave', 'gravissima']);
export type Gravidade = z.infer<typeof GravidadeSchema>;

export const MultaSchema = z.object({
  id: text(64),
  descricao: text(),
  data: isoDate,
  local: text(),
  gravidade: GravidadeSchema,
  pontos: z.number().int().min(0).max(7),
  valor: z.number().nonnegative(),
  valorComDesconto: z.number().nonnegative().optional(),
  prazoDesconto: isoDate.optional(),
  expiraContagemEm: isoDate,
});
export type Multa = z.infer<typeof MultaSchema>;

export const ResumoPontosSchema = z.object({
  total: z.number().int().min(0),
  limite: z.union([z.literal(20), z.literal(30), z.literal(40)]),
  alerta: z.enum(['verde', 'amarelo', 'vermelho']),
});
export type ResumoPontos = z.infer<typeof ResumoPontosSchema>;

export const GuiaSchema = z.object({
  multaId: text(64),
  linhaDigitavel: z.string().regex(/^[\d .]{40,60}$/).optional(),
  pixCopiaECola: z.string().max(512).optional(),
  pdfFileId: z.string().optional(),
});
export type Guia = z.infer<typeof GuiaSchema>;

// IPVA é estadual (Sefaz da UF); o resto vem da Senatran (federal).
export const VeiculoSchema = z.object({
  placa: z.string().regex(/^[A-Z]{3}\d[A-Z0-9]\d{2}$/),
  modelo: text(),
  licenciamento: z.object({ pago: z.boolean(), vencimento: isoDate }),
  ipvaEmAberto: z.number().nonnegative(),
  restricoes: z.array(text()),
  recall: z.array(text()),
  crlvFileId: z.string().optional(),
});
export type Veiculo = z.infer<typeof VeiculoSchema>;

export const ServiceSchema = z.enum(['uf', 'login', 'cnh', 'multas', 'veiculo']);
export type Service = z.infer<typeof ServiceSchema>;

export const StepEventSchema = z.object({
  sessionId: z.string(),
  service: ServiceSchema,
  step: z.string(),
  status: z.enum(['start', 'ok', 'error']),
  data: z.unknown().optional(),
  at: z.string(),
});
export type StepEvent = z.infer<typeof StepEventSchema>;

export const ToolNameSchema = z.enum([
  'selecionar_uf',
  'iniciar_login',
  'consultar_cnh',
  'baixar_cnh',
  'listar_multas',
  'gerar_guia_multa',
  'consultar_veiculos',
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const ToolInputs = {
  selecionar_uf: z.object({ uf: UFSchema }),
  iniciar_login: z.object({}),
  consultar_cnh: z.object({}),
  baixar_cnh: z.object({}),
  listar_multas: z.object({}),
  gerar_guia_multa: z.object({ multaId: z.string().min(1).max(64) }),
  consultar_veiculos: z.object({}),
} satisfies Record<ToolName, z.ZodType>;
