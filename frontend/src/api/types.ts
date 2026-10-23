export const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type UF = (typeof UF_LIST)[number];

export type Cnh = {
  nome: string;
  registro: string;
  categoria: string;
  validade: string;
  situacao: 'regular' | 'suspensa' | 'cassada' | 'vencida';
  pdfFileId?: string;
};

export type Gravidade = 'leve' | 'media' | 'grave' | 'gravissima';

export type Multa = {
  id: string;
  descricao: string;
  data: string;
  local: string;
  gravidade: Gravidade;
  pontos: number;
  valor: number;
  valorComDesconto?: number;
  prazoDesconto?: string;
  expiraContagemEm: string;
};

export type ResumoPontos = {
  total: number;
  limite: 20 | 30 | 40;
  alerta: 'verde' | 'amarelo' | 'vermelho';
};

export type Guia = {
  multaId: string;
  linhaDigitavel?: string;
  pixCopiaECola?: string;
  pixQrCode?: string;
  textoCompartilhar?: string;
  pdfFileId?: string;
};

export type Veiculo = {
  placa: string;
  modelo: string;
  licenciamento: { pago: boolean; vencimento: string };
  ipvaEmAberto: number;
  restricoes: string[];
  recall: string[];
  crlvFileId?: string;
};

export type ServiceName = 'uf' | 'login' | 'cnh' | 'multas' | 'veiculo';

export type StepEvent = {
  sessionId: string;
  service: ServiceName;
  step: string;
  status: 'start' | 'ok' | 'error';
  data?: unknown;
  at: string;
};

export type Identificadores = { cpf?: string; placa?: string; renavam?: string };

export type ToolInputs = {
  selecionar_uf: { uf: UF };
  iniciar_login: Record<string, never>;
  consultar_cnh: Record<string, never>;
  baixar_cnh: Record<string, never>;
  listar_multas: Identificadores;
  gerar_guia_multa: { multaId: string };
  consultar_veiculos: Identificadores;
};

export type ToolName = keyof ToolInputs;

export const TOOL_NAMES: readonly ToolName[] = [
  'selecionar_uf', 'iniciar_login', 'consultar_cnh', 'baixar_cnh', 'listar_multas', 'gerar_guia_multa', 'consultar_veiculos',
];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export type ToolResults = {
  selecionar_uf: { uf: UF };
  iniciar_login: { liveViewUrl: string; loggedIn: boolean };
  consultar_cnh: Cnh;
  baixar_cnh: { fileId: string; tipo: 'pdf' | 'comprovante' };
  listar_multas: { multas: Multa[]; pontos: ResumoPontos };
  gerar_guia_multa: Guia;
  consultar_veiculos: { veiculos: Veiculo[] };
};

export type ToolErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_TOOL'
  | 'NOT_FOUND'
  | 'UF_REQUIRED'
  | 'LOGIN_REQUIRED'
  | 'BAD_SOURCE_DATA'
  | 'SOURCE_UNAVAILABLE'
  | 'IDENTIFIERS_REQUIRED'
  | 'NOT_IMPLEMENTED'
  | 'BROWSER_UNAVAILABLE'
  | 'EXTRACTION_FAILED';

export type VoiceToken = { token: string; expiresAt: number; model: string };

export type ShareLink = {
  url: string;
  expiresAt: string;
  texto: string;
  whatsappUrl: string;
  emailUrl: string;
};

const SERVICES: readonly string[] = ['uf', 'login', 'cnh', 'multas', 'veiculo'];
const STATUSES: readonly string[] = ['start', 'ok', 'error'];

export function isStepEvent(value: unknown): value is StepEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.sessionId === 'string' &&
    typeof event.step === 'string' &&
    typeof event.at === 'string' &&
    SERVICES.includes(event.service as string) &&
    STATUSES.includes(event.status as string)
  );
}
