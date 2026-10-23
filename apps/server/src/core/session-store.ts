import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cnh, Guia, Multa, ResumoPontos, UF, Veiculo } from '@hackathon/contracts';

export type Session = {
  id: string;
  expiresAt: number;
  uf?: UF;
  browser?: { sessionId: string; liveViewUrl: string; loggedIn: boolean };
  profile: {
    cnh?: Cnh;
    multas?: Multa[];
    pontos?: ResumoPontos;
    guias?: Record<string, Guia>;
    veiculos?: Veiculo[];
  };
  voiceTokensIssued: number;
};

const hash = (token: string) => createHash('sha256').update(token).digest();

export class SessionStore {
  private sessions = new Map<string, { session: Session; tokenHash: Buffer }>();
  private sweeper: NodeJS.Timeout;

  constructor(private ttlMs: number, private onExpire: (id: string) => void = () => {}) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  create(): { session: Session; token: string } {
    const token = randomBytes(32).toString('base64url');
    const session: Session = {
      id: randomUUID(),
      expiresAt: Date.now() + this.ttlMs,
      profile: {},
      voiceTokensIssued: 0,
    };
    this.sessions.set(session.id, { session, tokenHash: hash(token) });
    return { session, token };
  }

  // Só devolve a sessão se o token secreto bater. Renova o TTL a cada acesso.
  authenticate(id: string, token: string): Session | undefined {
    const entry = this.sessions.get(id);
    if (!entry) return undefined;
    if (entry.session.expiresAt < Date.now()) {
      this.delete(id);
      return undefined;
    }
    if (!timingSafeEqual(entry.tokenHash, hash(token))) return undefined;
    entry.session.expiresAt = Date.now() + this.ttlMs;
    return entry.session;
  }

  delete(id: string) {
    if (this.sessions.delete(id)) this.onExpire(id);
  }

  close() {
    clearInterval(this.sweeper);
  }

  private sweep() {
    const now = Date.now();
    for (const [id, { session }] of this.sessions) {
      if (session.expiresAt < now) this.delete(id);
    }
  }
}
