import { MultaSchema, VeiculoSchema, type Gravidade, type Veiculo } from '@hackathon/contracts';
import { AdapterError } from '../http/errors.ts';
import type { MultaParaCalculo } from '../../domain/pontos/index.ts';
import { InfosimplesMultaItemSchema, InfosimplesVeiculoItemSchema } from './schemas.ts';

const MultaParaCalculoSchema = MultaSchema.omit({ pontos: true, expiraContagemEm: true });

function respostaInvalida(mensagem: string): never {
  throw new AdapterError('Infosimples', 'INVALID_RESPONSE', mensagem);
}

function textoObrigatorio(...valores: unknown[]): string {
  const valor = valores.find((item) => typeof item === 'string' || typeof item === 'number');
  if (valor === undefined || String(valor).trim() === '') respostaInvalida('Campo obrigatório ausente na Infosimples');
  return String(valor).trim();
}

function dataIso(valor: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? valor
    : valor.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
  const validacao = MultaSchema.shape.data.safeParse(iso);
  if (!validacao.success) respostaInvalida(`Data inválida recebida da Infosimples: ${valor}`);
  const [ano, mes, dia] = validacao.data.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1, dia!));
  if (data.toISOString().slice(0, 10) !== validacao.data) {
    respostaInvalida(`Data inexistente recebida da Infosimples: ${valor}`);
  }
  return validacao.data;
}

function dinheiro(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor !== 'string') respostaInvalida('Valor monetário ausente na Infosimples');

  const limpo = valor.trim().replace(/[^\d,.-]/g, '');
  const decimal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const numero = Number(decimal);
  if (!Number.isFinite(numero) || numero < 0) respostaInvalida(`Valor monetário inválido: ${valor}`);
  return numero;
}

function gravidade(valor: string): Gravidade {
  const normalizado = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  const mapa: Record<string, Gravidade> = {
    leve: 'leve',
    media: 'media',
    grave: 'grave',
    gravissima: 'gravissima',
  };
  return mapa[normalizado] ?? respostaInvalida(`Gravidade inválida: ${valor}`);
}

export function mapearMultasInfosimples(raw: unknown[]): MultaParaCalculo[] {
  return raw.map((item) => {
    const parsed = InfosimplesMultaItemSchema.safeParse(item);
    if (!parsed.success) respostaInvalida('Item de multa inválido na Infosimples');
    const multa = parsed.data;

    const valorComDesconto =
      multa.valor_com_desconto === undefined ? undefined : dinheiro(multa.valor_com_desconto);
    const prazoDesconto = multa.prazo_desconto ? dataIso(multa.prazo_desconto) : undefined;
    const resultado = MultaParaCalculoSchema.safeParse({
      id: textoObrigatorio(multa.id, multa.auto_infracao, multa.numero_auto, multa.renainf),
      descricao: textoObrigatorio(multa.descricao),
      data: dataIso(textoObrigatorio(multa.data, multa.data_infracao)),
      local: textoObrigatorio(multa.local),
      gravidade: gravidade(textoObrigatorio(multa.gravidade, multa.natureza)),
      valor: dinheiro(multa.valor ?? multa.normalizado_valor_multa ?? multa.valor_multa),
      ...(valorComDesconto === undefined ? {} : { valorComDesconto }),
      ...(prazoDesconto === undefined ? {} : { prazoDesconto }),
    });
    if (!resultado.success) respostaInvalida('Multa da Infosimples não corresponde ao contrato interno');
    return resultado.data;
  });
}

function lista(valor: string | string[] | undefined): string[] {
  if (Array.isArray(valor)) return valor.filter((item) => item.trim() !== '');
  if (!valor?.trim()) return [];
  return [valor.trim()];
}

export function mapearVeiculoInfosimples(raw: unknown): Veiculo {
  const parsed = InfosimplesVeiculoItemSchema.safeParse(raw);
  if (!parsed.success) respostaInvalida('Veículo inválido na Infosimples');
  const item = parsed.data;
  const licenciamento = item.licenciamento ?? item.veiculo.licenciamento;
  if (!licenciamento) respostaInvalida('Situação do licenciamento ausente na Infosimples');
  const crlvFileId = item.crlv_file_id ?? item.veiculo.crlv_file_id;

  const resultado = VeiculoSchema.safeParse({
    placa: item.veiculo.placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
    modelo: textoObrigatorio(item.veiculo.modelo, item.veiculo.marca_modelo),
    licenciamento: { pago: licenciamento.pago, vencimento: dataIso(licenciamento.vencimento) },
    ipvaEmAberto: dinheiro(item.ipva_em_aberto ?? item.veiculo.ipva_em_aberto),
    restricoes: item.restricoes ?? item.veiculo.restricoes ?? lista(item.veiculo.restricao),
    recall: item.recall ?? item.veiculo.recall ?? [],
    ...(crlvFileId === undefined ? {} : { crlvFileId }),
  });
  if (!resultado.success) respostaInvalida('Veículo da Infosimples não corresponde ao contrato interno');
  return resultado.data;
}
