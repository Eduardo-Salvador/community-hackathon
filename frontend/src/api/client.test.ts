import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeServer(handlers: Array<(url: string, init: RequestInit) => Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const handler = handlers[index++];
    if (!handler) throw new Error(`unexpected request ${url}`);
    return handler(url, init);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('ApiClient', () => {
  it('creates a session once and sends bearer token and session id on tool calls', async () => {
    const { fetchImpl, calls } = fakeServer([
      () => json(200, { id: 'sess-1', token: 'tok-1' }),
      () => json(200, { ok: true, result: { uf: 'SP' } }),
      () => json(200, { ok: true, result: { uf: 'RJ' } }),
    ]);
    const client = new ApiClient(fetchImpl);

    await expect(client.callTool('selecionar_uf', { uf: 'SP' })).resolves.toEqual({ uf: 'SP' });
    await client.callTool('selecionar_uf', { uf: 'RJ' });

    expect(calls.map((call) => call.url)).toEqual(['/session', '/tools/selecionar_uf', '/tools/selecionar_uf']);
    const toolCall = calls[1]!.init;
    expect(toolCall.method).toBe('POST');
    expect(header(toolCall, 'authorization')).toBe('Bearer tok-1');
    expect(header(toolCall, 'x-session-id')).toBe('sess-1');
    expect(header(toolCall, 'content-type')).toBe('application/json');
    expect(JSON.parse(String(toolCall.body))).toEqual({ uf: 'SP' });
    expect(calls[1]!.url).not.toContain('tok-1');
  });

  it('turns 409 UF_REQUIRED and LOGIN_REQUIRED into flow codes', async () => {
    const { fetchImpl } = fakeServer([
      () => json(200, { id: 's', token: 't' }),
      () => json(409, { ok: false, code: 'UF_REQUIRED', message: 'Selecione o estado antes.' }),
      () => json(409, { ok: false, code: 'LOGIN_REQUIRED', message: 'Faça login no gov.br antes.' }),
    ]);
    const client = new ApiClient(fetchImpl);

    const ufError = await client.callTool('consultar_cnh', {}).catch((error: unknown) => error);
    expect(ufError).toBeInstanceOf(ApiError);
    expect((ufError as ApiError).status).toBe(409);
    expect((ufError as ApiError).flowCode).toBe('UF_REQUIRED');

    const loginError = await client.callTool('consultar_cnh', {}).catch((error: unknown) => error);
    expect((loginError as ApiError).flowCode).toBe('LOGIN_REQUIRED');
    expect((loginError as ApiError).message).toBe('Faça login no gov.br antes.');
  });

  it('does not treat other 409 errors as flow codes', async () => {
    const { fetchImpl } = fakeServer([
      () => json(200, { id: 's', token: 't' }),
      () => json(409, { ok: false, code: 'BAD_SOURCE_DATA', message: 'Dados inválidos.' }),
    ]);
    const error = await new ApiClient(fetchImpl).callTool('listar_multas', {}).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('BAD_SOURCE_DATA');
    expect((error as ApiError).flowCode).toBeUndefined();
  });

  it('recreates the session once when the server answers 401', async () => {
    const { fetchImpl, calls } = fakeServer([
      () => json(200, { id: 'old', token: 'old-token' }),
      () => json(401, { code: 'UNAUTHORIZED' }),
      () => json(200, { id: 'new', token: 'new-token' }),
      () => json(200, { ok: true, result: { veiculos: [] } }),
    ]);
    const client = new ApiClient(fetchImpl);
    const changes: Array<string | undefined> = [];
    client.onSessionChange((credentials) => changes.push(credentials?.id));

    await expect(client.callTool('consultar_veiculos', {})).resolves.toEqual({ veiculos: [] });
    expect(header(calls[3]!.init, 'x-session-id')).toBe('new');
    expect(changes).toEqual(['old', undefined, 'new']);
  });

  it('fetches files with auth headers instead of putting the token in the URL', async () => {
    const { fetchImpl, calls } = fakeServer([
      () => json(200, { id: 's', token: 'secret' }),
      () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    ]);
    const blob = await new ApiClient(fetchImpl).fetchFile('abc');
    expect(await blob.text()).toBe('%PDF');
    expect(calls[1]!.url).toBe('/files/abc');
    expect(header(calls[1]!.init, 'authorization')).toBe('Bearer secret');
  });

  it('creates share links with auth headers and no JSON content type', async () => {
    const link = { url: 'https://api/s/x', expiresAt: '2026-10-23T17:00:00Z', texto: 't', whatsappUrl: 'https://wa.me/?text=t', emailUrl: 'mailto:?body=t' };
    const { fetchImpl, calls } = fakeServer([() => json(200, { id: 's', token: 't' }), () => json(200, link)]);
    await expect(new ApiClient(fetchImpl).shareFile('abc')).resolves.toEqual(link);
    expect(calls[1]!.url).toBe('/files/abc/share');
    expect(calls[1]!.init.method).toBe('POST');
    expect(header(calls[1]!.init, 'content-type')).toBeUndefined();
    expect(header(calls[1]!.init, 'x-session-id')).toBe('s');
  });

  it('rejects file ids that would escape /files', async () => {
    const { fetchImpl } = fakeServer([]);
    await expect(new ApiClient(fetchImpl).fetchFile('../session')).rejects.toBeInstanceOf(ApiError);
  });

  it('deletes the session with auth headers and forgets the token', async () => {
    const { fetchImpl, calls } = fakeServer([
      () => json(200, { id: 's', token: 't' }),
      () => new Response(null, { status: 204 }),
      () => json(200, { id: 's2', token: 't2' }),
    ]);
    const client = new ApiClient(fetchImpl);
    await client.session();
    await client.end();
    expect(calls[1]!.init.method).toBe('DELETE');
    expect(header(calls[1]!.init, 'x-session-id')).toBe('s');
    await expect(client.session()).resolves.toEqual({ id: 's2', token: 't2' });
  });
});

describe('socketUrl', () => {
  it('uses the API base URL when set and the page host otherwise', async () => {
    const { socketUrl } = await import('./events');
    expect(socketUrl('https://api.example.com')).toBe('wss://api.example.com/ws');
    expect(socketUrl('http://localhost:3000')).toBe('ws://localhost:3000/ws');
    expect(socketUrl('', { protocol: 'https:', host: 'site.example.com' } as Location)).toBe('wss://site.example.com/ws');
  });
});
