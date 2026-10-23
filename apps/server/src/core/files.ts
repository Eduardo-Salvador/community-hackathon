import { randomBytes } from 'node:crypto';

type StoredFile = {
  owner: string;
  contentType: string;
  filename: string;
  // Usado no texto de compartilhamento (ex.: "CNH digital de MARIA DA SILVA").
  title: string;
  body: Buffer;
  expiresAt: number;
};

type ShareLink = { fileId: string; expiresAt: number };

// PDFs (CNH, guias) ficam só em memória, com ID aleatório e dono fixo.
export class FileStore {
  private files = new Map<string, StoredFile>();
  private shares = new Map<string, ShareLink>();

  constructor(private ttlMs: number, private shareTtlMs = 15 * 60_000) {}

  put(owner: string, file: { contentType: string; filename: string; title: string; body: Buffer }): string {
    const id = randomBytes(16).toString('base64url');
    this.files.set(id, { ...file, owner, expiresAt: Date.now() + this.ttlMs });
    return id;
  }

  get(id: string, owner: string): StoredFile | undefined {
    const file = this.files.get(id);
    if (!file || file.owner !== owner) return undefined;
    if (file.expiresAt < Date.now()) {
      this.files.delete(id);
      return undefined;
    }
    return file;
  }

  // Link público e curto para mandar no WhatsApp/e-mail. Some quando expira ou quando a sessão acaba.
  share(id: string, owner: string): { token: string; expiresAt: number; file: StoredFile } | undefined {
    const file = this.get(id, owner);
    if (!file) return undefined;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(Date.now() + this.shareTtlMs, file.expiresAt);
    this.shares.set(token, { fileId: id, expiresAt });
    return { token, expiresAt, file };
  }

  getShared(token: string): StoredFile | undefined {
    const link = this.shares.get(token);
    if (!link) return undefined;
    const file = this.files.get(link.fileId);
    if (!file || link.expiresAt <= Date.now() || file.expiresAt < Date.now()) {
      this.shares.delete(token);
      return undefined;
    }
    return file;
  }

  dropOwner(owner: string) {
    for (const [id, file] of this.files) {
      if (file.owner === owner) this.files.delete(id);
    }
    const now = Date.now();
    for (const [token, link] of this.shares) {
      if (!this.files.has(link.fileId) || link.expiresAt < now) this.shares.delete(token);
    }
  }
}
