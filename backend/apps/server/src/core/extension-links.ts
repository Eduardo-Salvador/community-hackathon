import { createHash, randomBytes, randomInt } from 'node:crypto';

// Sem letras/números parecidos (0/O, 1/I/L) para o usuário digitar o código sem erro.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// Liga a extensão do Chrome do usuário a uma sessão: código curto de uso único → token da extensão.
export class ExtensionLinks {
  private codes = new Map<string, { sessionId: string; expiresAt: number }>();
  private tokens = new Map<string, string>();

  constructor(private codeTtlMs = 10 * 60_000) {}

  createCode(sessionId: string): { codigo: string; expiraEm: string } {
    for (const [code, entry] of this.codes) if (entry.sessionId === sessionId) this.codes.delete(code);
    let codigo = '';
    do codigo = Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    while (this.codes.has(codigo));
    const expiresAt = Date.now() + this.codeTtlMs;
    this.codes.set(codigo, { sessionId, expiresAt });
    return { codigo, expiraEm: new Date(expiresAt).toISOString() };
  }

  claim(codigo: string): { token: string; sessionId: string } | undefined {
    const key = codigo.trim().toUpperCase();
    const entry = this.codes.get(key);
    this.codes.delete(key);
    if (!entry || entry.expiresAt < Date.now()) return undefined;
    const token = randomBytes(32).toString('base64url');
    this.tokens.set(hash(token), entry.sessionId);
    return { token, sessionId: entry.sessionId };
  }

  isLinked(sessionId: string): boolean {
    for (const id of this.tokens.values()) if (id === sessionId) return true;
    return false;
  }

  sessionOf(token: string): string | undefined {
    return this.tokens.get(hash(token));
  }

  dropSession(sessionId: string) {
    for (const [code, entry] of this.codes) if (entry.sessionId === sessionId) this.codes.delete(code);
    for (const [h, id] of this.tokens) if (id === sessionId) this.tokens.delete(h);
  }
}

// Uma instância por processo (as sessões também vivem em memória).
export const extensionLinks = new ExtensionLinks();
