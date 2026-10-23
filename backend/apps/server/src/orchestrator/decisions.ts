import { z } from 'zod';
import type { Decision, ToolName } from '@hackathon/contracts';
import type { Config } from '../core/config.ts';
import type { Session } from '../core/session-store.ts';

const DECISIONS_URL = 'https://api.openai.com/v1/decisions';

// Passos que o orquestrador pode sugerir. Guia de pagamento e download ficam de fora:
// só acontecem quando o usuário pede.
const STEPS = {
  selecionar_uf: 'O estado (UF) do usuário ainda não foi definido.',
  iniciar_login: 'O usuário precisa entrar no gov.br para consultar dados pessoais.',
  consultar_cnh: 'Consultar validade, categoria e situação da CNH.',
  listar_multas: 'Consultar multas e pontos na carteira.',
  consultar_veiculos: 'Consultar licenciamento, IPVA e restrições dos veículos.',
  done: 'Tudo que é útil já foi consultado; aguardar o próximo pedido do usuário.',
} as const;
type Step = keyof typeof STEPS;

const ResponseSchema = z.object({
  answers: z.array(
    z.object({ name: z.string(), choice: z.string().optional(), confidence: z.number().optional() }),
  ),
});

function toDecision(step: Step, confidence: number): Decision {
  const reason = `${STEPS[step]} (confiança ${confidence.toFixed(2)})`;
  if (step === 'done') return { action: 'done', reason };
  if (step === 'selecionar_uf') return { action: 'ask_uf', tool: step, reason };
  if (step === 'iniciar_login') return { action: 'require_login', tool: step, reason };
  return { action: 'run_tool', tool: step as ToolName, reason };
}

// OpenAI Decisions API: escolhe o próximo passo a partir do estado (sem dados pessoais).
// Qualquer falha (sem chave, timeout, HTTP != 2xx, resposta fora do formato ou confiança baixa)
// devolve undefined e o orquestrador cai nas regras fixas.
export function createDecisionsClient(config: Config, fetchImpl: typeof fetch) {
  return {
    async decide(session: Session): Promise<Decision | undefined> {
      if (!config.decisionsEnabled || !config.openaiApiKey) return undefined;
      const state = {
        uf: session.uf ?? null,
        loggedIn: Boolean(session.browser?.loggedIn),
        consultado: {
          cnh: Boolean(session.profile.cnh),
          multas: Boolean(session.profile.multas),
          veiculos: Boolean(session.profile.veiculos),
        },
        alertaPontos: session.profile.pontos?.alerta ?? null,
      };
      try {
        const res = await fetchImpl(DECISIONS_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${config.openaiApiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: config.decisionsModel,
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: 'Estado de um assistente que resolve serviços do DETRAN para o usuário.' },
                  { type: 'input_json', data: state },
                ],
              },
            ],
            questions: [
              {
                type: 'choice',
                name: 'next_step',
                instructions: 'Qual deve ser o próximo passo do assistente?',
                choices: Object.entries(STEPS).map(([value, description]) => ({ value, description })),
              },
            ],
          }),
          signal: AbortSignal.timeout(config.decisionsTimeoutMs),
        });
        if (!res.ok) return undefined;
        const parsed = ResponseSchema.safeParse(await res.json());
        const answer = parsed.success ? parsed.data.answers.find((a) => a.name === 'next_step') : undefined;
        if (!answer?.choice || !(answer.choice in STEPS)) return undefined;
        const confidence = answer.confidence ?? 0;
        if (confidence < config.decisionsMinConfidence) return undefined;
        return toDecision(answer.choice as Step, confidence);
      } catch {
        return undefined;
      }
    },
  };
}

export type DecisionsClient = ReturnType<typeof createDecisionsClient>;
