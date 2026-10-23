export type Config = {
  port: number;
  mock: boolean;
  corsOrigin: string;
  publicUrl?: string;
  trustProxy: boolean;
  openaiApiKey?: string;
  mcpApiKey?: string;
  voiceModel: string;
  extractionModel: string;
  extractionTimeoutMs: number;
  decisionsEnabled: boolean;
  decisionsModel: string;
  decisionsTimeoutMs: number;
  decisionsMinConfidence: number;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  browserTimeoutSec: number;
  portalUrl: string;
  loginTimeoutMs: number;
  loginPollMs: number;
  sessionTtlMs: number;
  fileTtlMs: number;
  maxVoiceTokensPerSession: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    mock: env.MOCK !== '0',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    // URL pública do backend para os links de compartilhamento (ex.: https://api.exemplo.com).
    publicUrl: env.PUBLIC_URL || undefined,
    trustProxy: env.TRUST_PROXY !== '0',
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    // Chave que o dots (ou outro cliente MCP) manda em Authorization: Bearer. Sem ela, /mcp fica desligado.
    mcpApiKey: env.MCP_API_KEY || undefined,
    voiceModel: env.VOICE_MODEL ?? 'gpt-realtime',
    extractionModel: env.EXTRACTION_MODEL ?? 'gpt-6-astra',
    extractionTimeoutMs: 30_000,
    decisionsEnabled: env.DECISIONS !== '0',
    decisionsModel: env.DECISIONS_MODEL ?? 'gpt-6-luna',
    decisionsTimeoutMs: 1_500,
    decisionsMinConfidence: 0.6,
    browserbaseApiKey: env.BROWSERBASE_API_KEY || undefined,
    browserbaseProjectId: env.BROWSERBASE_PROJECT_ID || undefined,
    browserTimeoutSec: 15 * 60,
    // Confirmar a URL do Portal de Serviços da Senatran na A6.
    portalUrl: env.PORTAL_URL ?? 'https://portalservicos.senatran.serpro.gov.br/',
    loginTimeoutMs: 5 * 60_000,
    loginPollMs: 2_000,
    sessionTtlMs: 30 * 60_000,
    fileTtlMs: 15 * 60_000,
    maxVoiceTokensPerSession: 20,
  };
}
