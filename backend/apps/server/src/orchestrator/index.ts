import type { SessionState } from '@hackathon/contracts';
import type { Session } from '../core/session-store.ts';
import type { DecisionsClient } from './decisions.ts';
import { checkPrerequisites, nextStepByRules } from './rules.ts';

export class Orchestrator {
  constructor(private decisions: DecisionsClient) {}

  async state(session: Session): Promise<SessionState> {
    const rules = nextStepByRules(session);
    const suggested = await this.decisions.decide(session);
    // A Decisions API sugere o próximo passo, mas não pode pular pré-requisitos.
    const blocked = suggested?.tool ? checkPrerequisites(suggested.tool, session) : undefined;
    const next =
      suggested && !blocked ? { ...suggested, source: 'decisions' as const } : { ...rules, source: 'rules' as const };
    return {
      uf: session.uf,
      loggedIn: Boolean(session.browser?.loggedIn),
      has: {
        cnh: Boolean(session.profile.cnh),
        multas: Boolean(session.profile.multas),
        veiculos: Boolean(session.profile.veiculos),
      },
      next,
    };
  }
}

export { checkPrerequisites };
