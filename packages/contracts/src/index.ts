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

export const ToolResults = {
  selecionar_uf: z.object({ uf: UFSchema }),
  iniciar_login: z.object({ liveViewUrl: z.string(), loggedIn: z.boolean() }),
  consultar_cnh: CnhSchema,
  // tipo "comprovante": o portal não ofereceu o PDF e devolvemos um print (PNG) da tela da CNH.
  baixar_cnh: z.object({ fileId: z.string(), tipo: z.enum(['pdf', 'comprovante']) }),
  listar_multas: z.object({ multas: z.array(MultaSchema), pontos: ResumoPontosSchema }),
  gerar_guia_multa: GuiaSchema,
  consultar_veiculos: z.object({ veiculos: z.array(VeiculoSchema) }),
} satisfies Record<ToolName, z.ZodType>;

// Próximo passo sugerido ao agente (pela OpenAI Decisions API ou pelas regras fixas).
export const DecisionSchema = z.object({
  action: z.enum(['ask_uf', 'require_login', 'run_tool', 'done']),
  tool: ToolNameSchema.optional(),
  reason: z.string().max(200),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const SessionStateSchema = z.object({
  uf: UFSchema.optional(),
  loggedIn: z.boolean(),
  has: z.object({ cnh: z.boolean(), multas: z.boolean(), veiculos: z.boolean() }),
  next: DecisionSchema.extend({ source: z.enum(['decisions', 'rules']) }),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const ToolErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNKNOWN_TOOL',
  'NOT_FOUND',
  'UF_REQUIRED',
  'LOGIN_REQUIRED',
  'BAD_SOURCE_DATA',
  'NOT_IMPLEMENTED',
  'BROWSER_UNAVAILABLE',
  'EXTRACTION_FAILED',
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;
