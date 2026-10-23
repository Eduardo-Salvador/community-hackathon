import type { Decision, ToolName } from '@hackathon/contracts';
import type { Session } from '../core/session-store.ts';

const NEEDS_UF = new Set<ToolName>(['iniciar_login']);
const NEEDS_LOGIN = new Set<ToolName>([
  'consultar_cnh',
  'baixar_cnh',
  'listar_multas',
  'gerar_guia_multa',
  'consultar_veiculos',
]);

// Pré-requisitos são sempre determinísticos: nem a Decisions API nem o modelo de voz podem pular.
export function checkPrerequisites(tool: ToolName, session: Session): Decision | undefined {
  if ((NEEDS_UF.has(tool) || NEEDS_LOGIN.has(tool)) && !session.uf) {
    return { action: 'ask_uf', tool: 'selecionar_uf', reason: 'Selecione o estado antes de continuar' };
  }
  if (NEEDS_LOGIN.has(tool) && !session.browser?.loggedIn) {
    return { action: 'require_login', tool: 'iniciar_login', reason: 'Faça login no gov.br primeiro' };
  }
  return undefined;
}

export function nextStepByRules(session: Session): Decision {
  const { profile } = session;
  if (!session.uf) return { action: 'ask_uf', tool: 'selecionar_uf', reason: 'Descobrir o estado do usuário' };
  if (!session.browser?.loggedIn) {
    return { action: 'require_login', tool: 'iniciar_login', reason: 'Login necessário para consultar dados' };
  }
  if (!profile.cnh) return { action: 'run_tool', tool: 'consultar_cnh', reason: 'Mostrar a situação da CNH' };
  if (!profile.multas) return { action: 'run_tool', tool: 'listar_multas', reason: 'Verificar multas e pontos' };
  if (!profile.veiculos) return { action: 'run_tool', tool: 'consultar_veiculos', reason: 'Verificar veículos' };
  return { action: 'done', reason: 'Tudo consultado' };
}
