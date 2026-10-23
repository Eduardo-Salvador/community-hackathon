import { z } from 'zod';
import { type Decision, ToolInputs, type ToolName } from '@hackathon/contracts';
import { ToolError } from '../core/errors.ts';
import { checkPrerequisites } from '../orchestrator/rules.ts';
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
  | { ok: false; code: string; message: string; next?: Decision };

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
  const blocked = checkPrerequisites(tool.name, ctx.session);
  if (blocked) {
    const code = blocked.action === 'ask_uf' ? 'UF_REQUIRED' : 'LOGIN_REQUIRED';
    emit(tool.name, 'error', { code, next: blocked });
    return { ok: false, code, message: blocked.reason, next: blocked };
  }
  try {
    const result = await tool.handler({ ...ctx, emit }, input.data as never);
    emit(tool.name, 'ok', result);
    return { ok: true, result };
  } catch (err) {
    const failure =
      err instanceof ToolError
        ? { code: err.code, message: err.message }
        : err instanceof UntrustedDataError
          ? { code: 'BAD_SOURCE_DATA', message: err.message }
          : { code: 'INTERNAL', message: 'Erro inesperado' };
    emit(tool.name, 'error', failure);
    if (failure.code === 'INTERNAL') throw err;
    return { ok: false, ...failure };
  }
}
