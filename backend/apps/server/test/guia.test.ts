import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { buildApp } from '../src/app.ts';
import type { BrowserProvider } from '../src/browser/types.ts';
import { loadConfig } from '../src/core/config.ts';

const PORTAL = 'https://portalservicos.senatran.serpro.gov.br/';
const BOLETO_PDF = 'https://portalservicos.senatran.serpro.gov.br/sne/boleto.pdf';
const LINHA = '34191.75462 24615.781234 41234.510000 3 83840000003090';
const PIX = '00020101021226800014br.gov.bcb.pix0136chave-oficial-sne5204000053039865802BR6304ABCD';

type Link = { text: string; href: string | null };

// Portal falso: lista de infrações → abre a multa → "Pagar com desconto" mostra a guia.
function fakePortal(opts: { guiaNaTela?: boolean } = {}) {
  const s = { url: '', loggedIn: false, text: '', links: [] as Link[], clicks: [] as string[] };
  const page = {
    url: () => s.url,
    goto: async (url: string) => {
      if (!s.loggedIn) return void (s.url = 'https://sso.acesso.gov.br/login');
      s.url = url;
      s.text = 'Minhas infrações\nAvançar sinal vermelho - R$ 293,47';
      s.links = [{ text: 'Avançar sinal vermelho', href: null }];
    },
    waitForLoadState: async () => {},
    locator: (sel: string) => ({
      evaluateAll: async () => s.links.map((l, index) => ({ index, ...l })),
      nth: (i: number) => ({
        click: async () => {
          const text = s.links[i]?.text ?? '';
          s.clicks.push(text);
          if (text === 'Avançar sinal vermelho') s.links = [{ text: 'Pagar com desconto', href: null }];
          if (text === 'Pagar com desconto') {
            s.text = opts.guiaNaTela === false ? 'Serviço indisponível' : `Linha digitável: ${LINHA}\nPix copia e cola: ${PIX}`;
            s.links = [{ text: 'Baixar boleto', href: BOLETO_PDF }];
          }
        },
      }),
      innerText: async () => (sel === 'body' ? s.text : ''),
    }),
    context: () => ({
      request: {
        get: async (href: string) => ({
          url: () => href,
          ok: () => true,
          status: () => 200,
          body: async () => Buffer.from('%PDF-1.4 boleto oficial'),
          headers: () => ({ 'content-type': 'application/pdf' }),
        }),
      },
    }),
  } as unknown as Page;
  const provider: BrowserProvider = {
    open: async () => ({ id: 'bb', liveViewUrl: 'https://live.test', page, close: async () => {} }),
  };
  return { s, provider };
}

// OpenAI falsa: responde conforme o que está sendo extraído.
const fakeOpenAI = (guiaEncontrada = true) =>
  (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const name = body.text.format.name;
    const data =
      name === 'multas_portal'
        ? {
            ear: false,
            multas: [
              {
                id: 'm1', descricao: 'Avançar sinal vermelho', data: '2026-03-10', local: 'Av. Paulista',
                gravidade: 'gravissima', valor: 293.47, valorComDesconto: 176.08, prazoDesconto: '2099-11-10',
              },
            ],
          }
        : { encontrado: guiaEncontrada, linhaDigitavel: guiaEncontrada ? LINHA : null, pixCopiaECola: guiaEncontrada ? PIX : null };
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
  }) as typeof fetch;

async function setup(env: Record<string, string>, portal: ReturnType<typeof fakePortal>, fetchImpl: typeof fetch) {
  const config = { ...loadConfig({ MOCK: '0', OPENAI_API_KEY: 'sk', DECISIONS: '0', ...env }), loginPollMs: 5 };
  const app = await buildApp(config, { browserProvider: portal.provider, fetch: fetchImpl });
  const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
  const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
  const call = (name: string, payload: object = {}) => app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });
  const file = (fileId: string) => app.inject({ method: 'GET', url: `/files/${fileId}`, headers });
  await call('selecionar_uf', { uf: 'SP' });
  await call('iniciar_login');
  await new Promise((r) => setTimeout(r, 20)); // usuário no gov.br
  portal.s.loggedIn = true;
  portal.s.url = `${PORTAL}#/home`;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await call('listar_multas')).statusCode, 200);
  return { app, call, file };
}

test('guia oficial é gerada no portal: boleto, Pix, QR e PDF do gov.br', async () => {
  const portal = fakePortal();
  const { app, call, file } = await setup({}, portal, fakeOpenAI());
  const res = await call('gerar_guia_multa', { multaId: 'm1' });
  assert.equal(res.statusCode, 200);
  const guia = res.json().result;
  assert.equal(guia.linhaDigitavel, LINHA);
  assert.equal(guia.pixCopiaECola, PIX);
  assert.ok(guia.pixQrCode.startsWith('data:image/png;base64,'));
  assert.equal(guia.demonstracao, false);
  assert.ok(!guia.textoCompartilhar.includes('DEMONSTRA'));
  assert.deepEqual(portal.s.clicks, ['Avançar sinal vermelho', 'Pagar com desconto']);
  assert.equal((await file(guia.pdfFileId)).body, '%PDF-1.4 boleto oficial');
  await app.close();
});

test('portal sem guia na tela responde NOT_FOUND', async () => {
  const portal = fakePortal({ guiaNaTela: false });
  const { app, call } = await setup({}, portal, fakeOpenAI(false));
  const res = await call('gerar_guia_multa', { multaId: 'm1' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'NOT_FOUND');
  await app.close();
});

test('GUIA_DEMO=1 devolve guia marcada como demonstração, sem tocar no portal de pagamento', async () => {
  const portal = fakePortal();
  const { app, call, file } = await setup({ GUIA_DEMO: '1' }, portal, fakeOpenAI());
  const guia = (await call('gerar_guia_multa', { multaId: 'm1' })).json().result;
  assert.equal(guia.demonstracao, true);
  assert.ok(guia.textoCompartilhar.startsWith('DEMONSTRAÇÃO - NÃO PAGUE'));
  assert.ok(!portal.s.clicks.includes('Pagar com desconto'));
  assert.match(String((await file(guia.pdfFileId)).body), /DEMONSTRACAO - NAO PAGUE/);
  await app.close();
});
