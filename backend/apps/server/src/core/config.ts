import { loadMockPdf, type MockPerfil, parseMockPerfil } from './mock-perfil.ts';

export type Config = {
  port: number;
  mock: boolean;
  mockPerfil: MockPerfil;
  mockCnhPdf?: Buffer;
  corsOrigins: string[];
  publicUrl?: string;
  trustProxy: boolean;
  keepAliveUrl?: string;
  keepAliveIntervalMs: number;
  portalKeepAliveMs: number;
  openaiApiKey?: string;
  mcpApiKey?: string;
  voiceModel: string;
  adapterTimeoutMs: number;
  infosimplesToken?: string;
  infosimplesMultasUrl?: string;
  infosimplesVeiculoUrl?: string;
  senatranMultasUrl?: string;
  senatranVeiculosUrl?: string;
  senatranCnhUrl: string;
  portalLoginUrl: string;
  guiaDemo: boolean;
  extractionModel: string;
  extractionTimeoutMs: number;
  decisionsEnabled: boolean;
  decisionsModel: string;
  decisionsTimeoutMs: number;
  decisionsMinConfidence: number;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  browserTimeoutSec: number;
  browserProxyCountry?: string;
  browserVerified: boolean;
  portalUrl: string;
  loginTimeoutMs: number;
  loginPollMs: number;
  sessionTtlMs: number;
  fileTtlMs: number;
  maxVoiceTokensPerSession: number;
};

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const portal = (env.PORTAL_URL || 'https://portalservicos.senatran.serpro.gov.br/').replace(/\/?$/, '/');
  return {
    port: Number(env.PORT ?? 3000),
    mock: env.MOCK !== '0',
    mockPerfil: parseMockPerfil(env.MOCK_PERFIL),
    // Caminho do PDF da CNH de demonstração (ex.: Secret File do Render em /etc/secrets/cnh.pdf).
    mockCnhPdf: loadMockPdf(env.MOCK_CNH_PDF),
    // Aceita várias URLs separadas por vírgula; barra no final é ignorada (o navegador não manda barra).
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    // URL pública do backend para os links de compartilhamento (ex.: https://api.exemplo.com).
    publicUrl: env.PUBLIC_URL || undefined,
    trustProxy: env.TRUST_PROXY !== '0',
    // Render Free: URL do próprio /health para não dormir (ex.: https://x.onrender.com/health).
    keepAliveUrl: env.KEEP_ALIVE_URL || undefined,
    keepAliveIntervalMs: 10 * 60_000,
    // Recarrega o portal das sessões logadas para o gov.br não deslogar enquanto a conversa está ativa.
    portalKeepAliveMs: 10 * 60_000,
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    // Chave que o dots (ou outro cliente MCP) manda em Authorization: Bearer. Sem ela, /mcp fica desligado.
    mcpApiKey: env.MCP_API_KEY || undefined,
    // Mais barato com function calling (padrão da OpenAI para voz). Precisa de conta paga (tier Build+).
    voiceModel: env.VOICE_MODEL || 'gpt-realtime-2.1-mini',
    adapterTimeoutMs: inteiroPositivo(env.ADAPTER_TIMEOUT_MS, 15_000),
    infosimplesToken: env.INFOSIMPLES_TOKEN || undefined,
    infosimplesMultasUrl: env.INFOSIMPLES_MULTAS_URL || undefined,
    infosimplesVeiculoUrl: env.INFOSIMPLES_VEICULO_URL || undefined,
    // Rotas do catálogo oficial do portal (/portalservicos-ws/funcionalidade/home).
    senatranMultasUrl: env.SENATRAN_MULTAS_URL || `${portal}#/infracoes/consultar`,
    senatranVeiculosUrl: env.SENATRAN_VEICULOS_URL || `${portal}#/veiculos/meus-veiculos`,
    senatranCnhUrl: env.SENATRAN_CNH_URL || `${portal}#/habilitacao/consultar`,
    // Tela protegida: abrir ela força o redirecionamento para o login do gov.br (a home é pública).
    portalLoginUrl: env.PORTAL_LOGIN_URL || `${portal}#/infracoes/consultar`,
    // Guia de demonstração (marcada, não pagável) enquanto a tela de pagamento do portal não é validada.
    guiaDemo: env.GUIA_DEMO === '1',
    extractionModel: env.EXTRACTION_MODEL ?? 'gpt-6-astra',
    extractionTimeoutMs: 30_000,
    decisionsEnabled: env.DECISIONS !== '0',
    decisionsModel: env.DECISIONS_MODEL ?? 'gpt-6-luna',
    decisionsTimeoutMs: 1_500,
    decisionsMinConfidence: 0.6,
    browserbaseApiKey: env.BROWSERBASE_API_KEY || undefined,
    browserbaseProjectId: env.BROWSERBASE_PROJECT_ID || undefined,
    // Cobre a conversa inteira; o navegador é fechado antes se a sessão expirar (30 min sem uso).
    browserTimeoutSec: 60 * 60,
    // Proxy residencial da Browserbase (país ISO). BROWSERBASE_PROXY=off desliga.
    // Modo Verified da Browserbase (planos pagos). BROWSERBASE_VERIFIED=off desliga.
    browserVerified: env.BROWSERBASE_VERIFIED !== 'off',
    browserProxyCountry: env.BROWSERBASE_PROXY === 'off' ? undefined : env.BROWSERBASE_PROXY || 'BR',
    // Confirmar a URL do Portal de Serviços da Senatran na A6.
    portalUrl: portal,
    loginTimeoutMs: 5 * 60_000,
    loginPollMs: 2_000,
    sessionTtlMs: 30 * 60_000,
    fileTtlMs: 15 * 60_000,
    maxVoiceTokensPerSession: 20,
  };
}
