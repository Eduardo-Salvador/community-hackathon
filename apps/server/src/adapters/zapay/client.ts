import { z } from 'zod';
import type { HttpClient } from '../http/client.ts';
import { createHttpClient } from '../http/client.ts';
import { AdapterError } from '../http/errors.ts';
import { mapearGuiaZapay, type GuiaZapay } from './mapper.ts';
import { ZapayGuiaResponseSchema } from './schemas.ts';

export type ZapayClientConfig = {
  guiaUrl?: string;
  accessToken?: string;
  customerId?: string;
  authScheme?: string;
  apiVersion?: string;
  timeoutMs?: number;
};

export type GerarGuiaZapayInput = {
  multaId: string;
  descricao: string;
  valorCentavos: number;
  descontoSneAplicado: boolean;
};

const GerarGuiaZapayInputSchema = z.object({
  multaId: z.string().min(1).max(64),
  descricao: z.string().min(1).max(200),
  valorCentavos: z.number().int().positive(),
  descontoSneAplicado: z.boolean(),
});

const MAX_PDF_BYTES = 5 * 1024 * 1024;

export class ZapayClient {
  constructor(
    private config: ZapayClientConfig,
    private http: HttpClient = createHttpClient(globalThis.fetch, config.timeoutMs),
  ) {}

  async gerarGuia(input: GerarGuiaZapayInput): Promise<GuiaZapay> {
    if (!this.config.guiaUrl || !this.config.accessToken || !this.config.customerId) {
      throw new AdapterError('Zapay', 'NOT_CONFIGURED', 'Zapay não configurada');
    }
    const parsed = GerarGuiaZapayInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'Dados da guia são inválidos');
    }
    const { multaId, descricao, valorCentavos, descontoSneAplicado } = parsed.data;
    const payload = {
      customer_id: this.config.customerId,
      external_id: multaId,
      closed: true,
      amount: valorCentavos,
      items: [
        {
          product_id: multaId,
          amount: valorCentavos,
          description: descricao,
          type: 'vehicle_debt',
        },
      ],
      payments: [{ payment_method: 'pix', amount: valorCentavos, pix: {} }],
      metadata: { multa_id: multaId, desconto_sne_aplicado: descontoSneAplicado },
    };

    const response = await this.http.requestJson(
      {
        provider: 'Zapay',
        url: this.config.guiaUrl,
        method: 'POST',
        headers: {
          authorization: `${this.config.authScheme ?? 'JWT'} ${this.config.accessToken}`,
          accept: `application/json; version=${this.config.apiVersion ?? 'v2.0'}`,
        },
        body: payload,
        timeoutMs: this.config.timeoutMs,
      },
      ZapayGuiaResponseSchema,
    );
    return mapearGuiaZapay(multaId, response);
  }

  async baixarPdf(pdfUrl: string): Promise<Buffer> {
    if (!this.config.guiaUrl || !this.config.accessToken) {
      throw new AdapterError('Zapay', 'NOT_CONFIGURED', 'Zapay não configurada');
    }

    let url: URL;
    try {
      url = new URL(pdfUrl);
      if (url.protocol !== 'https:' || url.origin !== new URL(this.config.guiaUrl).origin) {
        throw new Error('origem não permitida');
      }
    } catch {
      throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'URL do PDF da Zapay é inválida');
    }

    const { body } = await this.http.requestBytes({
      provider: 'Zapay',
      url: url.toString(),
      headers: {
        authorization: `${this.config.authScheme ?? 'JWT'} ${this.config.accessToken}`,
        accept: 'application/pdf',
      },
      timeoutMs: this.config.timeoutMs,
      maxBytes: MAX_PDF_BYTES,
      contentType: 'application/pdf',
    });
    if (!body.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new AdapterError('Zapay', 'INVALID_RESPONSE', 'Arquivo retornado não é um PDF válido');
    }
    return body;
  }
}
