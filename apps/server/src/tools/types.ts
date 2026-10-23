import type { z } from 'zod';
import type { Service, StepEvent, ToolInputs, ToolName, ToolResults } from '@hackathon/contracts';
import type { Config } from '../core/config.ts';
import type { FileStore } from '../core/files.ts';
import type { Session } from '../core/session-store.ts';

// O core mantém a página opaca para não depender de Playwright/Stagehand.
// Apenas os adapters de portal devem conhecer e converter o tipo concreto.
export type BrowserPageHandle = unknown;
export type GetPage = (sessionId: string) => Promise<BrowserPageHandle | undefined>;

export type EmitStep = (step: string, status: StepEvent['status'], data?: unknown) => void;

export type ToolContext = {
  session: Session;
  config: Config;
  files: FileStore;
  getPage: GetPage;
  emit: EmitStep;
};

// Definição neutra: não depende de Fastify, OpenAI ou MCP. O mesmo registry
// alimenta a rota HTTP, a sessão de voz e, depois, um servidor MCP.
export type ToolDefinition<N extends ToolName = ToolName> = {
  name: N;
  service: Service;
  description: string;
  handler: (
    ctx: ToolContext,
    input: z.infer<(typeof ToolInputs)[N]>,
  ) => Promise<z.infer<(typeof ToolResults)[N]>>;
};

export const defineTool = <N extends ToolName>(tool: ToolDefinition<N>) => tool;
