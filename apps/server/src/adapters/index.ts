import type { Config } from '../core/config.ts';
import { createHttpClient } from './http/client.ts';
import { InfosimplesClient } from './infosimples/client.ts';
import { ZapayClient } from './zapay/client.ts';

export function createAdapters(config: Config, fetchImpl: typeof fetch = globalThis.fetch) {
  const http = createHttpClient(fetchImpl, config.adapterTimeoutMs);
  return {
    infosimples: new InfosimplesClient(
      {
        token: config.infosimplesToken,
        multasUrl: config.infosimplesMultasUrl,
        veiculoUrl: config.infosimplesVeiculoUrl,
        timeoutMs: config.adapterTimeoutMs,
      },
      http,
    ),
    zapay: new ZapayClient(
      {
        guiaUrl: config.zapayGuiaUrl,
        accessToken: config.zapayAccessToken,
        authScheme: config.zapayAuthScheme,
        apiVersion: config.zapayApiVersion,
        timeoutMs: config.adapterTimeoutMs,
      },
      http,
    ),
  };
}

export type Adapters = ReturnType<typeof createAdapters>;
