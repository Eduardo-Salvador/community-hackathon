import { UF_LIST, type UF } from '../api/types';

export type Action =
  | { type: 'cnh' }
  | { type: 'baixarCnh' }
  | { type: 'multas' }
  | { type: 'pix'; multaId?: string; hint?: string }
  | { type: 'veiculo' };

export type Intent =
  | { type: 'action'; action: Action }
  | { type: 'uf'; uf: UF }
  | { type: 'yes' }
  | { type: 'no' }
  | { type: 'unknown' };

const STATE_NAMES: Record<string, UF> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', brasilia: 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso do sul': 'MS', 'mato grosso': 'MT', 'minas gerais': 'MG', minas: 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

const STATE_PATTERNS = Object.entries(STATE_NAMES)
  .sort(([a], [b]) => b.length - a.length)
  .map(([name, uf]) => ({ name, pattern: new RegExp(`\\b${name}\\b`), uf }));

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseUf(text: string, expectingUf = false): UF | undefined {
  const normalized = normalize(text);
  const phrased = /\b(sou de|sou do|sou da|moro (em|no|na)|estado)\b/.test(normalized);
  for (const { name, pattern, uf } of STATE_PATTERNS) {
    if (pattern.test(normalized) && (phrased || expectingUf || normalized === name)) return uf;
  }
  const codes = text.match(/\b[A-Za-z]{2}\b/g) ?? [];
  for (const code of codes) {
    const upper = code.toUpperCase() as UF;
    if (!UF_LIST.includes(upper)) continue;
    if (code === upper || phrased || normalized === code.toLowerCase()) return upper;
  }
  return undefined;
}

const YES = /^(sim|s|quero|pode|claro|isso|ok|okay|bora|manda|confirmo|confirma|por favor|pode sim|sim pode)\b/;
const NO = /^(nao|n|agora nao|depois|deixa|cancela|nao quero)\b/;

export function detectIntent(text: string, expectingUf = false): Intent {
  const normalized = normalize(text);
  const uf = parseUf(text, expectingUf);
  if (uf) return { type: 'uf', uf };

  const words = normalized.split(' ').length;
  if (words <= 5 && NO.test(normalized)) return { type: 'no' };
  if (/\b(pix|boleto|guia|pagar|pagamento)\b/.test(normalized)) {
    return { type: 'action', action: { type: 'pix', hint: normalized } };
  }
  if (words <= 5 && YES.test(normalized)) return { type: 'yes' };
  if (/\b(baixa|baixar|pdf|download)\b/.test(normalized) && !/\b(crlv|carro|veiculo)\b/.test(normalized)) {
    return { type: 'action', action: { type: 'baixarCnh' } };
  }
  if (/\b(multas?|pontos?|infra\w*|pontuacao)\b/.test(normalized)) return { type: 'action', action: { type: 'multas' } };
  if (/\b(carros?|veiculos?|ipva|licenciamento|recall|motos?|placa|crlv)\b/.test(normalized)) {
    return { type: 'action', action: { type: 'veiculo' } };
  }
  if (/\b(cnh|carteira|habilitacao|vence|validade|vencida|vencimento)\b/.test(normalized)) {
    return { type: 'action', action: { type: 'cnh' } };
  }
  return { type: 'unknown' };
}
