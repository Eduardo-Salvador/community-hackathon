import type { z } from 'zod';
import type { HttpClient } from '../http/client.ts';
import { createHttpClient } from '../http/client.ts';
import { AdapterError } from '../http/errors.ts';
import { InfosimplesEnvelopeSchema } from './schemas.ts';

type Parametro = string | number | boolean | undefined;
export type ConsultaInfosimplesInput = Record<string, Parametro>;

export type InfosimplesClientConfig = {
  token?: string;
  multasUrl?: string;
  veiculoUrl?: string;
  timeoutMs?: number;
};

export class InfosimplesClient {
  constructor(
    private config: InfosimplesClientConfig,
    private http: HttpClient = createHttpClient(globalThis.fetch, config.timeoutMs),
  ) {}

  consultarMultas(input: ConsultaInfosimplesInput): Promise<unknown[]> {
    return this.consultar(this.config.multasUrl, input);
  }

  consultarVeiculo(input: ConsultaInfosimplesInput): Promise<unknown[]> {
    return this.consultar(this.config.veiculoUrl, input);
  }

  // Consultas sem senha do usuário, por nome do serviço no catálogo (ex.: "senatran/recall").
  consultarServico(servico: string, input: ConsultaInfosimplesInput): Promise<unknown[]> {
    return this.consultar(`https://api.infosimples.com/api/v2/consultas/${servico}`, input);
  }

  private async consultar(url: string | undefined, input: ConsultaInfosimplesInput): Promise<unknown[]> {
    if (!this.config.token || !url) {
      throw new AdapterError('Infosimples', 'NOT_CONFIGURED', 'Infosimples não configurada');
    }

    const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    const response = await this.http.requestJson(
      {
        provider: 'Infosimples',
        url,
        method: 'POST',
        // O input nunca pode sobrescrever a credencial configurada no backend.
        body: { ...body, token: this.config.token },
        timeoutMs: this.config.timeoutMs,
      },
      InfosimplesEnvelopeSchema,
    );

    if (response.code < 200 || response.code >= 300) {
      throw new AdapterError(
        'Infosimples',
        'PROVIDER_ERROR',
        `Infosimples retornou código ${response.code}`,
        { retryable: response.code === 429 || response.code >= 500 },
      );
    }
    return response.data;
  }
}

export type InfosimplesEnvelope = z.infer<typeof InfosimplesEnvelopeSchema>;
