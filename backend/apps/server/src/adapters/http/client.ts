import type { z } from 'zod';
import { AdapterError } from './errors.ts';

export type JsonRequest = {
  provider: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export type BinaryRequest = Omit<JsonRequest, 'body'> & {
  maxBytes?: number;
  contentType?: string;
};

export type HttpClient = {
  requestJson<S extends z.ZodType>(request: JsonRequest, schema: S): Promise<z.output<S>>;
  requestBytes(request: BinaryRequest): Promise<{ body: Buffer; contentType: string }>;
};

export function createHttpClient(
  fetchImpl: typeof fetch = globalThis.fetch,
  defaultTimeoutMs = 15_000,
): HttpClient {
  return {
    async requestJson<S extends z.ZodType>(request: JsonRequest, schema: S): Promise<z.output<S>> {
      const controller = new AbortController();
      const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(request.url, {
          method: request.method ?? 'GET',
          headers: {
            accept: 'application/json',
            ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...request.headers,
          },
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new AdapterError(
            request.provider,
            'HTTP_ERROR',
            `${request.provider} respondeu HTTP ${response.status}`,
            { status: response.status, retryable: response.status === 429 || response.status >= 500 },
          );
        }

        let raw: unknown;
        try {
          raw = await response.json();
        } catch {
          throw new AdapterError(request.provider, 'INVALID_RESPONSE', 'Resposta não é um JSON válido');
        }

        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          throw new AdapterError(request.provider, 'INVALID_RESPONSE', 'Resposta não corresponde ao contrato esperado');
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        if (controller.signal.aborted) {
          throw new AdapterError(request.provider, 'TIMEOUT', `${request.provider} excedeu ${timeoutMs} ms`, {
            retryable: true,
          });
        }
        throw new AdapterError(request.provider, 'NETWORK', `Falha de rede ao acessar ${request.provider}`, {
          retryable: true,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    async requestBytes(request: BinaryRequest): Promise<{ body: Buffer; contentType: string }> {
      const controller = new AbortController();
      const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(request.url, {
          method: request.method ?? 'GET',
          headers: request.headers,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new AdapterError(
            request.provider,
            'HTTP_ERROR',
            `${request.provider} respondeu HTTP ${response.status}`,
            { status: response.status, retryable: response.status === 429 || response.status >= 500 },
          );
        }

        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
        if (request.contentType && contentType !== request.contentType) {
          throw new AdapterError(request.provider, 'INVALID_RESPONSE', 'Tipo do arquivo recebido é inválido');
        }

        const declaredLength = Number(response.headers.get('content-length'));
        if (request.maxBytes && Number.isFinite(declaredLength) && declaredLength > request.maxBytes) {
          throw new AdapterError(request.provider, 'INVALID_RESPONSE', 'Arquivo recebido excede o limite permitido');
        }
        const body = Buffer.from(await response.arrayBuffer());
        if (request.maxBytes && body.byteLength > request.maxBytes) {
          throw new AdapterError(request.provider, 'INVALID_RESPONSE', 'Arquivo recebido excede o limite permitido');
        }
        return { body, contentType };
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        if (controller.signal.aborted) {
          throw new AdapterError(request.provider, 'TIMEOUT', `${request.provider} excedeu ${timeoutMs} ms`, {
            retryable: true,
          });
        }
        throw new AdapterError(request.provider, 'NETWORK', `Falha de rede ao acessar ${request.provider}`, {
          retryable: true,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
