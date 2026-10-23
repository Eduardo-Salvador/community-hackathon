import { z } from 'zod';
import type { HttpClient } from '../http/client.ts';
import { createHttpClient } from '../http/client.ts';
import { AdapterError } from '../http/errors.ts';
import { mapearGuiaZapay, type GuiaZapay } from './mapper.ts';
import { ZapayGuiaResponseSchema } from './schemas.ts';

export type ZapayClientConfig = {
  guiaUrl?: string;
  accessToken?: string;
  authScheme?: string;
  apiVersion?: string;
  timeoutMs?: number;
};

export type GerarGuiaZapayInput = {
  multaId: string;
  payload: Record<string, unknown>;
};

export class ZapayClient {
  constructor(
    private config: ZapayClientConfig,
    private http: HttpClient = createHttpClient(globalThis.fetch, config.timeoutMs),
  ) {}

  async gerarGuia({ multaId, payload }: GerarGuiaZapayInput): Promise<GuiaZapay> {
    if (!this.config.guiaUrl || !this.config.accessToken) {
      throw new AdapterError('Zapay', 'NOT_CONFIGURED', 'Zapay não configurada');
    }
    const body = z.record(z.string(), z.unknown()).safeParse(payload);
    if (!body.success) {
      throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'Payload de pagamento inválido');
    }

    const response = await this.http.requestJson(
      {
        provider: 'Zapay',
        url: this.config.guiaUrl,
        method: 'POST',
        headers: {
          authorization: `${this.config.authScheme ?? 'JWT'} ${this.config.accessToken}`,
          accept: `application/json; version=${this.config.apiVersion ?? 'v2.0'}`,
        },
        body: body.data,
        timeoutMs: this.config.timeoutMs,
      },
      ZapayGuiaResponseSchema,
    );
    return mapearGuiaZapay(multaId, response);
  }
}
