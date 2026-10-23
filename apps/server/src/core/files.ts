import { randomBytes } from 'node:crypto';

type StoredFile = { owner: string; contentType: string; filename: string; body: Buffer; expiresAt: number };

// PDFs (CNH, guias) ficam só em memória, com ID aleatório e dono fixo.
export class FileStore {
  private files = new Map<string, StoredFile>();

  constructor(private ttlMs: number) {}

  put(owner: string, file: { contentType: string; filename: string; body: Buffer }): string {
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

  dropOwner(owner: string) {
    for (const [id, file] of this.files) {
      if (file.owner === owner) this.files.delete(id);
    }
  }
}
