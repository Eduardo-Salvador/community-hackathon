import type { ShareLink, ToolInputs, ToolName, ToolResults, VoiceToken } from './types';

export type Credentials = { id: string; token: string };

export type ToolInput<N extends ToolName> = ToolInputs[N];

export const FLOW_CODES = ['UF_REQUIRED', 'LOGIN_REQUIRED'] as const;
export type FlowCode = (typeof FLOW_CODES)[number];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly body?: unknown,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }

  get flowCode(): FlowCode | undefined {
    return this.status === 409 && (FLOW_CODES as readonly string[]).includes(this.code)
      ? (this.code as FlowCode)
      : undefined;
  }
}

type Fetch = typeof fetch;
type ErrorBody = { ok?: false; code?: string; message?: string };

export class ApiClient {
  private credentials?: Credentials;
  private creating?: Promise<Credentials>;
  private readonly sessionListeners = new Set<(credentials: Credentials | undefined) => void>();

  constructor(
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
    private readonly baseUrl = '',
  ) {}

  onSessionChange(listener: (credentials: Credentials | undefined) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  async session(): Promise<Credentials> {
    if (this.credentials) return this.credentials;
    this.creating ??= this.createSession().finally(() => {
      this.creating = undefined;
    });
    return this.creating;
  }

  async callTool<N extends ToolName>(name: N, input: ToolInput<N>): Promise<ToolResults[N]> {
    const response = await this.request(`/tools/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as { ok: true; result: ToolResults[N] };
    return body.result;
  }

  async fetchFile(fileId: string): Promise<Blob> {
    const response = await this.request(filePath(fileId), { method: 'GET' });
    return response.blob();
  }

  async shareFile(fileId: string): Promise<ShareLink> {
    const response = await this.request(`${filePath(fileId)}/share`, { method: 'POST' });
    return response.json();
  }

  async voiceToken(): Promise<VoiceToken> {
    const response = await this.request('/voice/token', { method: 'POST' });
    return response.json();
  }

  async end(): Promise<void> {
    const credentials = this.credentials;
    this.forget();
    if (!credentials) return;
    await this.fetchImpl(`${this.baseUrl}/session`, {
      method: 'DELETE',
      headers: authHeaders(credentials),
    }).catch(() => undefined);
  }

  private async request(path: string, init: RequestInit, retried = false): Promise<Response> {
    const credentials = await this.session();
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders(credentials) },
    });
    if (response.ok) return response;
    if (response.status === 401 && !retried) {
      this.forget();
      return this.request(path, init, true);
    }
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(response.status, body.code ?? 'HTTP_ERROR', body.message, body);
  }

  private async createSession(): Promise<Credentials> {
    const response = await this.fetchImpl(`${this.baseUrl}/session`, { method: 'POST' });
    if (!response.ok) throw new ApiError(response.status, response.status === 429 ? 'RATE_LIMITED' : 'SESSION_FAILED');
    const { id, token } = (await response.json()) as Credentials;
    this.credentials = { id, token };
    this.sessionListeners.forEach((listener) => listener(this.credentials));
    return this.credentials;
  }

  private forget() {
    if (!this.credentials) return;
    this.credentials = undefined;
    this.sessionListeners.forEach((listener) => listener(undefined));
  }
}

function filePath(fileId: string): string {
  if (!fileId || /[/?#\\]|\.\./.test(fileId)) throw new ApiError(400, 'INVALID_FILE_ID');
  return `/files/${encodeURIComponent(fileId)}`;
}

function authHeaders({ id, token }: Credentials): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'x-session-id': id };
}
