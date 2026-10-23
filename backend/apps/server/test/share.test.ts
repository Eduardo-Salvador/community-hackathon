import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/core/config.ts';
import { FileStore } from '../src/core/files.ts';
import { guiaShareText } from '../src/core/share.ts';

async function setup(env: Record<string, string> = {}) {
  const app = await buildApp(loadConfig({ MOCK: '1', PUBLIC_URL: 'https://api.test', ...env }));
  const newSession = async () => {
    const { id, token } = (await app.inject({ method: 'POST', url: '/session' })).json();
    const headers = { 'x-session-id': id, authorization: `Bearer ${token}` };
    const call = (name: string, payload: object = {}) =>
      app.inject({ method: 'POST', url: `/tools/${name}`, headers, payload });
    await call('selecionar_uf', { uf: 'SP' });
    await call('iniciar_login');
    return { headers, call };
  };
  return { app, newSession };
}

test('compartilhar CNH: link público, texto e links de WhatsApp/e-mail', async () => {
  const { app, newSession } = await setup();
  const { headers, call } = await newSession();
  await call('consultar_cnh');
  const { fileId } = (await call('baixar_cnh')).json().result;

  const share = (await app.inject({ method: 'POST', url: `/files/${fileId}/share`, headers })).json();
  assert.match(share.url, /^https:\/\/api\.test\/s\/[\w-]{40,}$/);
  assert.match(share.texto, /^CNH digital de MARIA DA SILVA\nhttps:\/\/api\.test\/s\//);
  assert.equal(share.whatsappUrl, `https://wa.me/?text=${encodeURIComponent(share.texto)}`);
  assert.ok(share.emailUrl.startsWith('mailto:?subject=CNH%20digital%20de%20MARIA%20DA%20SILVA&body='));

  const path = new URL(share.url).pathname;
  const opened = await app.inject({ method: 'GET', url: path });
  assert.equal(opened.statusCode, 200);
  assert.equal(opened.headers['content-type'], 'application/pdf');
  assert.equal(opened.headers['content-disposition'], 'inline; filename="cnh-digital.pdf"');
  assert.equal(opened.headers['x-robots-tag'], 'noindex');
  await app.close();
});

test('não compartilha arquivo de outra sessão e token inventado dá 404', async () => {
  const { app, newSession } = await setup();
  const a = await newSession();
  const b = await newSession();
  const { fileId } = (await a.call('baixar_cnh')).json().result;
  assert.equal((await app.inject({ method: 'POST', url: `/files/${fileId}/share`, headers: b.headers })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/files/${fileId}/share` })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/s/inventado' })).statusCode, 404);
  await app.close();
});

test('link expira', () => {
  const files = new FileStore(60_000, 0);
  const id = files.put('dono', { contentType: 'application/pdf', filename: 'x.pdf', title: 'X', body: Buffer.from('x') });
  const shared = files.share(id, 'dono')!;
  assert.equal(files.getShared(shared.token), undefined);
});

test('link morre quando a sessão do dono acaba', () => {
  const files = new FileStore(60_000);
  const id = files.put('dono', { contentType: 'application/pdf', filename: 'x.pdf', title: 'X', body: Buffer.from('x') });
  const shared = files.share(id, 'dono')!;
  assert.ok(files.getShared(shared.token));
  files.dropOwner('dono');
  assert.equal(files.getShared(shared.token), undefined);
});

test('sem PUBLIC_URL usa o host da requisição', async () => {
  const { app, newSession } = await setup({ PUBLIC_URL: '' });
  const { headers, call } = await newSession();
  const { fileId } = (await call('baixar_cnh')).json().result;
  const share = (await app.inject({ method: 'POST', url: `/files/${fileId}/share`, headers })).json();
  assert.match(share.url, /^http:\/\/localhost(:\d+)?\/s\//);
  await app.close();
});

test('guia traz QR Code do Pix e texto pronto', async () => {
  const { app, newSession } = await setup();
  const { call } = await newSession();
  const { multas } = (await call('listar_multas')).json().result;
  const guia = (await call('gerar_guia_multa', { multaId: multas[0].id })).json().result;
  assert.ok(guia.pixQrCode.startsWith('data:image/png;base64,'));
  assert.match(guia.textoCompartilhar, /Valor: R\$ 176,08/);
  assert.match(guia.textoCompartilhar, /Vencimento: 10\/11\/2026/);
  assert.ok(guia.textoCompartilhar.endsWith(guia.pixCopiaECola));
  await app.close();
});

test('texto da guia com boleto e sem vencimento', () => {
  const text = guiaShareText({ descricao: 'Estacionar em local proibido', valor: 195.23, linhaDigitavel: '1234 5678' });
  assert.equal(text, 'Multa: Estacionar em local proibido\nValor: R$ 195,23\nBoleto: 1234 5678');
});
