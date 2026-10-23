export type Config = {
  port: number;
  mock: boolean;
  corsOrigin: string;
  openaiApiKey?: string;
  voiceModel: string;
  decisionsEnabled: boolean;
  decisionsModel: string;
  decisionsTimeoutMs: number;
  decisionsMinConfidence: number;
  sessionTtlMs: number;
  fileTtlMs: number;
  maxVoiceTokensPerSession: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    mock: env.MOCK !== '0',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    voiceModel: env.VOICE_MODEL ?? 'gpt-realtime',
    decisionsEnabled: env.DECISIONS !== '0',
    decisionsModel: env.DECISIONS_MODEL ?? 'gpt-6-luna',
    decisionsTimeoutMs: 1_500,
    decisionsMinConfidence: 0.6,
    sessionTtlMs: 30 * 60_000,
    fileTtlMs: 15 * 60_000,
    maxVoiceTokensPerSession: 20,
  };
}
