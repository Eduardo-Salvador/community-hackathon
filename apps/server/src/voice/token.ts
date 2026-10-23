import type { Config } from '../core/config.ts';
import { listToolSchemas } from '../tools/registry.ts';
import { VOICE_INSTRUCTIONS } from './instructions.ts';

const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

export type VoiceToken = { token: string; expiresAt: number; model: string };

export class VoiceUpstreamError extends Error {
  constructor(public status: number) {
    super(`OpenAI respondeu ${status}`);
  }
}

// Gera um token temporário da OpenAI Realtime já com as tools e as instruções.
// O frontend conecta direto na OpenAI com esse token (WebRTC). Quando o modelo pedir
// uma tool, o frontend repassa para POST /tools/:name e devolve o resultado ao modelo.
export async function createVoiceToken(config: Config, fetchImpl: typeof fetch): Promise<VoiceToken> {
  const res = await fetchImpl(CLIENT_SECRETS_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime',
        model: config.voiceModel,
        instructions: VOICE_INSTRUCTIONS,
        tool_choice: 'auto',
        tools: listToolSchemas().map((t) => ({ type: 'function', ...t })),
      },
    }),
  });
  if (!res.ok) throw new VoiceUpstreamError(res.status);
  const body = (await res.json()) as { value: string; expires_at: number };
  return { token: body.value, expiresAt: body.expires_at, model: config.voiceModel };
}
