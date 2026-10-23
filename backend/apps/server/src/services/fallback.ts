import type { IdentificadoresConsulta } from '@hackathon/contracts';
import { AdapterError } from '../adapters/http/errors.ts';
import { sleep } from '../core/errors.ts';
import type { ToolContext } from '../tools/types.ts';

export type IdentificadoresNormalizados = {
  cpf?: string;
  placa?: string;
  renavam?: string;
};

export function normalizarIdentificadores(
  entrada: IdentificadoresConsulta,
): IdentificadoresNormalizados | undefined {
  const cpf = entrada.cpf?.replace(/\D/g, '');
  const placa = entrada.placa?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const renavam = entrada.renavam?.replace(/\D/g, '');
  if (cpf) return { cpf };
  if (placa && renavam) return { placa, renavam };
  return undefined;
}

// Repete uma vez somente falhas transitórias (timeout, rede, 429 ou 5xx).
export async function consultarApiComRetry<T>(
  ctx: ToolContext,
  operacao: () => Promise<T>,
): Promise<T> {
  ctx.emit('consultando_api_fallback', 'start');
  try {
    const resultado = await operacao();
    ctx.emit('consultando_api_fallback', 'ok');
    return resultado;
  } catch (error) {
    if (!(error instanceof AdapterError) || !error.options.retryable) {
      ctx.emit('consultando_api_fallback', 'error');
      throw error;
    }
    ctx.emit('consultando_api_fallback', 'error', { retryable: true });
  }

  ctx.emit('repetindo_consulta_api', 'start', { tentativa: 2 });
  await sleep(150);
  try {
    const resultado = await operacao();
    ctx.emit('repetindo_consulta_api', 'ok', { tentativa: 2 });
    return resultado;
  } catch (error) {
    ctx.emit('repetindo_consulta_api', 'error', { tentativa: 2 });
    throw error;
  }
}
