export type Config = {
  port: number;
  mock: boolean;
  corsOrigin: string;
  openaiApiKey?: string;
  voiceModel: string;
  adapterTimeoutMs: number;
  infosimplesToken?: string;
  infosimplesMultasUrl?: string;
  infosimplesVeiculoUrl?: string;
  senatranMultasUrl?: string;
  senatranVeiculosUrl?: string;
  zapayGuiaUrl?: string;
  zapayAccessToken?: string;
  zapayCustomerId?: string;
  zapayAuthScheme: string;
  zapayApiVersion: string;
  sessionTtlMs: number;
  fileTtlMs: number;
  maxVoiceTokensPerSession: number;
};

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    mock: env.MOCK !== '0',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    voiceModel: env.VOICE_MODEL ?? 'gpt-realtime',
    adapterTimeoutMs: inteiroPositivo(env.ADAPTER_TIMEOUT_MS, 15_000),
    infosimplesToken: env.INFOSIMPLES_TOKEN || undefined,
    infosimplesMultasUrl: env.INFOSIMPLES_MULTAS_URL || undefined,
    infosimplesVeiculoUrl: env.INFOSIMPLES_VEICULO_URL || undefined,
    senatranMultasUrl: env.SENATRAN_MULTAS_URL || undefined,
    senatranVeiculosUrl: env.SENATRAN_VEICULOS_URL || undefined,
    zapayGuiaUrl: env.ZAPAY_GUIA_URL || undefined,
    zapayAccessToken: env.ZAPAY_ACCESS_TOKEN || undefined,
    zapayCustomerId: env.ZAPAY_CUSTOMER_ID || undefined,
    zapayAuthScheme: env.ZAPAY_AUTH_SCHEME ?? 'JWT',
    zapayApiVersion: env.ZAPAY_API_VERSION ?? 'v2.0',
    sessionTtlMs: 30 * 60_000,
    fileTtlMs: 15 * 60_000,
    maxVoiceTokensPerSession: 20,
  };
}
