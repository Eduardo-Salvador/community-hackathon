import type { Cnh, Guia, Multa, ResumoPontos, Veiculo } from '../api/types';
import type { Action } from '../lib/intents';
import { UF_NAMES } from '../lib/ufs';
import {
  brl, dateBR, dayMonth, dayReference, discountPercent, lowerFirst, monthReference, monthYearLong,
} from '../lib/format';

export const UF_QUESTION = 'Claro! Isso é com o DETRAN. De qual estado você é?';
export const PIX_READY = 'Prontinho! O Pix está aqui do lado. É só pagar no app do seu banco.';
export const BOLETO_READY = 'Prontinho. Copie a linha digitável e pague no app do seu banco.';
export const LOGIN_TIMEOUT = 'O tempo para entrar no gov.br acabou. Quer tentar de novo?';
export const GOVBR_EXPIRED = 'Sua sessão no gov.br caiu. Entre de novo aqui do lado para continuar.';
export const LOGIN_AGAIN_DONE = 'Pronto, você entrou de novo. O que você precisa?';
export const CNH_RECEIPT_DOWNLOADED =
  'O portal não liberou o PDF agora, então baixei um comprovante (imagem da tela da sua CNH).';
export const PIX_DECLINED = 'Tudo bem, não gerei nada. Se mudar de ideia, é só pedir.';
export const FALLBACK_ERROR = 'Não consegui falar com o DETRAN agora. Tente de novo em instantes.';
export const NOT_AVAILABLE = 'Esse serviço ainda não está disponível por aqui. Logo, logo!';
export const RETRY_LATER = 'O portal do DETRAN não respondeu direito agora. Tente de novo em instantes.';
export const UNKNOWN =
  'Por enquanto eu cuido do DETRAN: CNH, multas e pontos, e veículo. Experimente uma destas:';
export const SUGGESTIONS = ['Minha CNH vence quando?', 'Tenho multa?', 'Meu carro tá em dia?'];

const SUBJECTS: Record<Action['type'], string> = {
  cnh: 'sua CNH',
  baixarCnh: 'sua CNH',
  multas: 'suas multas',
  pix: 'suas multas',
  veiculo: 'seu veículo',
};

export function guiaReadyMessage(guia: Guia): string {
  return guia.pixCopiaECola || !guia.linhaDigitavel ? PIX_READY : BOLETO_READY;
}

export function loginMessage(action?: Action): string {
  if (!action) return 'Para continuar, entre na sua conta gov.br aqui do lado. Você digita a senha direto no gov.br, eu não vejo nada disso.';
  return `Para ver ${SUBJECTS[action.type]}, entre na sua conta gov.br aqui do lado. Você digita a senha direto no gov.br, eu não vejo nada disso.`;
}

export function ufSaved(uf: string): string {
  return `Beleza, ${UF_NAMES[uf] ?? uf}! O que você precisa?`;
}

export function cnhMessage(cnh: Cnh): string {
  switch (cnh.situacao) {
    case 'regular':
      return `Tudo certo com a sua CNH: está regular e vale até ${monthYearLong(cnh.validade)}. Quer o PDF?`;
    case 'vencida':
      return `Sua CNH venceu em ${dateBR(cnh.validade)}. Dá pra renovar no DETRAN. Quer o PDF mesmo assim?`;
    default:
      return `Atenção: sua CNH está ${cnh.situacao}. A validade é ${dateBR(cnh.validade)}. Quer o PDF?`;
  }
}

export const CNH_DOWNLOADED = 'Pronto, o PDF da sua CNH foi baixado.';

export function multasMessage(multas: Multa[], resumo: ResumoPontos, now = new Date()): string {
  if (multas.length === 0) {
    return resumo.total === 0
      ? 'Você não tem multas nem pontos na carteira. Tudo limpo!'
      : `Você não tem multas em aberto. São ${resumo.total} pontos de ${resumo.limite}.`;
  }
  const count = multas.length === 1 ? '1 multa' : `${multas.length} multas`;
  const sentences = [`Você tem ${count}, somando ${resumo.total} pontos de ${resumo.limite}.`];
  const next = [...multas].sort((a, b) => a.expiraContagemEm.localeCompare(b.expiraContagemEm))[0];
  if (next && next.pontos > 0) {
    const subject = multas.length === 1 ? 'Ela' : `A de ${next.pontos} pontos`;
    sentences.push(`${subject} sai da contagem em ${monthReference(next.expiraContagemEm, now)}.`);
  }
  const discounted = bestDiscount(multas);
  if (discounted?.valorComDesconto !== undefined && discounted.prazoDesconto) {
    const percent = discountPercent(discounted.valor, discounted.valorComDesconto);
    sentences.push(`Dá pra pagar com ${percent}% de desconto até ${dayReference(discounted.prazoDesconto, now)}.`);
  }
  sentences.push('Quer o Pix?');
  return sentences.join(' ');
}

export function bestDiscount(multas: Multa[]): Multa | undefined {
  return [...multas]
    .filter((multa) => multa.valorComDesconto !== undefined && multa.prazoDesconto)
    .sort((a, b) => (a.prazoDesconto ?? '').localeCompare(b.prazoDesconto ?? '') || b.valor - a.valor)[0];
}

export function pixConfirmMessage(multa: Multa): string {
  if (multa.valorComDesconto !== undefined) {
    const percent = discountPercent(multa.valor, multa.valorComDesconto);
    return `Confirma? Pix de ${brl(multa.valorComDesconto)} para a multa “${multa.descricao}”, já com ${percent}% de desconto pelo SNE.`;
  }
  return `Confirma? Pix de ${brl(multa.valor)} para a multa “${multa.descricao}”.`;
}

export function vehicleName(modelo: string): string {
  const words = modelo.trim().split(/\s+/);
  const name = words[1] ?? words[0] ?? 'veículo';
  return name === name.toUpperCase() ? name.charAt(0) + name.slice(1).toLowerCase() : name;
}

export function isVehicleClear(veiculo: Veiculo): boolean {
  return veiculo.licenciamento.pago && veiculo.ipvaEmAberto === 0 && veiculo.restricoes.length === 0;
}

function vehicleSentence(veiculo: Veiculo): string {
  const name = vehicleName(veiculo.modelo);
  const sentences: string[] = [];
  if (isVehicleClear(veiculo)) {
    sentences.push(`Seu ${name} está em dia: licenciamento pago e nada de IPVA atrasado.`);
  } else {
    const issues: string[] = [];
    if (!veiculo.licenciamento.pago) issues.push(`licenciamento pendente (vence ${dateBR(veiculo.licenciamento.vencimento)})`);
    if (veiculo.ipvaEmAberto > 0) issues.push(`${brl(veiculo.ipvaEmAberto)} de IPVA em aberto`);
    if (veiculo.restricoes.length > 0) {
      issues.push(veiculo.restricoes.length === 1 ? '1 restrição' : `${veiculo.restricoes.length} restrições`);
    }
    sentences.push(`Seu ${name} tem pendências: ${issues.join(', ')}.`);
  }
  if (veiculo.recall.length === 1) {
    const lead = isVehicleClear(veiculo) ? 'Só tem um recall' : 'Também tem um recall pendente';
    sentences.push(`${lead}: ${lowerFirst(veiculo.recall[0] ?? '')}, que é de graça na concessionária.`);
  } else if (veiculo.recall.length > 1) {
    sentences.push(`Tem ${veiculo.recall.length} recalls pendentes. O reparo é de graça na concessionária.`);
  }
  return sentences.join(' ');
}

export function veiculoMessage(veiculos: Veiculo[]): string {
  if (veiculos.length === 0) return 'Não encontrei veículos no seu nome.';
  if (veiculos.length === 1 && veiculos[0]) return vehicleSentence(veiculos[0]);
  return `Encontrei ${veiculos.length} veículos no seu nome. ${veiculos.map(vehicleSentence).join(' ')}`;
}

export function thinkingCaption(action: Action['type'] | 'uf' | 'confirm' | undefined): string {
  switch (action) {
    case 'cnh':
      return 'Consultando sua CNH…';
    case 'baixarCnh':
      return 'Baixando o PDF…';
    case 'multas':
      return 'Buscando suas multas…';
    case 'pix':
      return 'Preparando o Pix…';
    case 'veiculo':
      return 'Consultando seu veículo…';
    case 'uf':
      return 'Anotando seu estado…';
    case 'confirm':
      return 'Gerando o Pix…';
    default:
      return 'Só um instante…';
  }
}
