import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GuiaSchema, ToolResults, VeiculoSchema } from '@hackathon/contracts';
import { createHttpClient } from '../src/adapters/http/client.ts';
import { AdapterError } from '../src/adapters/http/errors.ts';
import { InfosimplesClient } from '../src/adapters/infosimples/client.ts';
import {
  mapearMultasInfosimples,
  mapearVeiculoInfosimples,
} from '../src/adapters/infosimples/mapper.ts';
import { ZapayClient } from '../src/adapters/zapay/client.ts';
import { calcularPontos } from '../src/domain/pontos/index.ts';

test('cliente HTTP aplica timeout e retorna erro tipado sem vazar a resposta', async () => {
  const fetchPendente = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')));
    })) as typeof fetch;
  const http = createHttpClient(fetchPendente, 5);

  await assert.rejects(
    http.requestJson({ provider: 'Teste', url: 'https://example.test' }, GuiaSchema),
    (error: unknown) => error instanceof AdapterError && error.code === 'TIMEOUT' && error.options.retryable === true,
  );
});

test('Infosimples envia token e mapeia multas para o domínio e o contrato final', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        code: 200,
        code_message: 'OK',
        data: [
          {
            auto_infracao: 'AIT-1',
            descricao: 'Avançar sinal vermelho',
            data_infracao: '10/03/2026',
            local: 'Av. Paulista',
            natureza: 'Gravíssima',
            normalizado_valor_multa: '293.47',
            valor_com_desconto: 'R$ 176,08',
            prazo_desconto: '10/11/2026',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const client = new InfosimplesClient(
    { token: 'token-secreto', multasUrl: 'https://api.infosimples.test/multas' },
    createHttpClient(fetchMock),
  );

  const raw = await client.consultarMultas({
    placa: 'ABC1D23',
    renavam: '12345678901',
    token: 'nao-pode-sobrescrever',
  });
  const resultado = calcularPontos(mapearMultasInfosimples(raw), false, '2026-10-23');

  assert.deepEqual(requestBody, {
    token: 'token-secreto',
    placa: 'ABC1D23',
    renavam: '12345678901',
  });
  assert.equal(resultado.multas[0]?.pontos, 7);
  assert.equal(resultado.multas[0]?.expiraContagemEm, '2027-03-10');
  assert.equal(resultado.pontos.limite, 30);
  assert.equal(ToolResults.listar_multas.safeParse(resultado).success, true);
});

test('mapper da Infosimples normaliza veículo e valida o contrato', () => {
  const veiculo = mapearVeiculoInfosimples({
    veiculo: {
      placa: 'abc-1d23',
      marca_modelo: 'VW GOL 1.0',
      licenciamento: { pago: false, vencimento: '31/10/2026' },
      restricao: 'Bloqueio administrativo',
      recall: ['Airbag'],
    },
    ipva_em_aberto: 'R$ 1.234,56',
  });

  assert.deepEqual(veiculo, {
    placa: 'ABC1D23',
    modelo: 'VW GOL 1.0',
    licenciamento: { pago: false, vencimento: '2026-10-31' },
    ipvaEmAberto: 1234.56,
    restricoes: ['Bloqueio administrativo'],
    recall: ['Airbag'],
  });
  assert.equal(VeiculoSchema.safeParse(veiculo).success, true);
});

test('Zapay envia autenticação/versionamento e mapeia Pix e boleto', async () => {
  let requestHeaders: Headers | undefined;
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestHeaders = new Headers(init?.headers);
    return new Response(
      JSON.stringify({
        order_id: 'order-1',
        charges: [
          {
            last_transaction: {
              pix: { qr_code: '00020101021226800014br.gov.bcb.pix-test' },
              bank_slip: {
                line: '34191.75462 24615.781234 41234.510000 3 83840000003090',
                pdf: 'https://api.b2b.usezapay.test/guia.pdf',
              },
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const client = new ZapayClient(
    {
      guiaUrl: 'https://api.b2b.usezapay.test/orders',
      accessToken: 'jwt-secreto',
      authScheme: 'JWT',
      apiVersion: 'v2.0',
    },
    createHttpClient(fetchMock),
  );

  const resultado = await client.gerarGuia({ multaId: 'm1', payload: { external_id: 'm1' } });

  assert.equal(requestHeaders?.get('authorization'), 'JWT jwt-secreto');
  assert.equal(requestHeaders?.get('accept'), 'application/json; version=v2.0');
  assert.equal(resultado.guia.multaId, 'm1');
  assert.equal(resultado.guia.pixCopiaECola, '00020101021226800014br.gov.bcb.pix-test');
  assert.equal(resultado.pdfUrl, 'https://api.b2b.usezapay.test/guia.pdf');
  assert.equal(GuiaSchema.safeParse(resultado.guia).success, true);
});

test('adapters distinguem configuração ausente e erro retornado pelo fornecedor', async () => {
  const semConfig = new InfosimplesClient({});
  await assert.rejects(
    semConfig.consultarMultas({ placa: 'ABC1D23' }),
    (error: unknown) => error instanceof AdapterError && error.code === 'NOT_CONFIGURED',
  );

  const fetchMock = (async () =>
    new Response(JSON.stringify({ code: 503, code_message: 'Portal indisponível', data: [] }), {
      status: 200,
    })) as typeof fetch;
  const indisponivel = new InfosimplesClient(
    { token: 'token', veiculoUrl: 'https://api.infosimples.test/veiculo' },
    createHttpClient(fetchMock),
  );
  await assert.rejects(
    indisponivel.consultarVeiculo({ placa: 'ABC1D23' }),
    (error: unknown) =>
      error instanceof AdapterError && error.code === 'PROVIDER_ERROR' && error.options.retryable === true,
  );
});
