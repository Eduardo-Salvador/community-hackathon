import { z } from 'zod';
import { ToolInputs, ToolResults, type ToolName } from '@hackathon/contracts';
import { AdapterError } from '../adapters/http/errors.ts';
import { ToolError } from '../core/errors.ts';
import { UntrustedDataError } from '../core/untrusted.ts';
import type { EventBus } from '../core/events.ts';
import { cnhTools } from '../services/cnh/index.ts';
import { loginTools } from '../services/login/index.ts';
import { multasTools } from '../services/multas/index.ts';
import { ufTools } from '../services/uf/index.ts';
import { veiculoTools } from '../services/veiculo/index.ts';
import type { ToolContext, ToolDefinition } from './types.ts';

const tools = new Map<ToolName, ToolDefinition>(
  [...ufTools, ...loginTools, ...cnhTools, ...multasTools, ...veiculoTools].map((t) => [
    t.name,
    t as ToolDefinition,
  ]),
);

export function listToolSchemas() {
  return [...tools.values()].map((t) => ({
    name: t.name,
    description: t.description,
    parameters: z.toJSONSchema(ToolInputs[t.name]),
  }));
}

export type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string };

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: Omit<ToolContext, 'emit'>,
  events: EventBus,
): Promise<ToolResult> {
  const tool = tools.get(name as ToolName);
  if (!tool) return { ok: false, code: 'UNKNOWN_TOOL', message: `Tool ${name} não existe` };

  const input = ToolInputs[tool.name].safeParse(rawInput ?? {});
  if (!input.success) return { ok: false, code: 'INVALID_INPUT', message: z.prettifyError(input.error) };

  const emit: ToolContext['emit'] = (step, status, data) =>
    events.emitStep(ctx.session.id, tool.service, step, status, data);

  emit(tool.name, 'start');
  try {
    const rawResult = await tool.handler({ ...ctx, emit }, input.data as never);
    const output = ToolResults[tool.name].safeParse(rawResult);
    if (!output.success) {
      throw new UntrustedDataError(`tool:${tool.name}`, output.error.issues);
    }
    const result = output.data;
    emit(tool.name, 'ok', result);
    return { ok: true, result };
  } catch (err) {
    const failure =
      err instanceof ToolError
        ? { code: err.code, message: err.message }
        : err instanceof UntrustedDataError
          ? { code: 'BAD_SOURCE_DATA', message: err.message }
          : err instanceof AdapterError
            ? {
                code: err.code === 'INVALID_RESPONSE' ? 'BAD_SOURCE_DATA' : 'SOURCE_UNAVAILABLE',
                message: `${err.provider} indisponível`,
              }
          : { code: 'INTERNAL', message: 'Erro inesperado' };
    emit(tool.name, 'error', failure);
    if (failure.code === 'INTERNAL') throw err;
    return { ok: false, ...failure };
  }
}
