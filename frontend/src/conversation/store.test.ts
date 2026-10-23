import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { createMockBackend } from '../mock/backend';
import type { StepEvent } from '../api/types';
import { ConversationStore, type AssistantItem } from './store';
import { PIX_READY } from './copy';

function setup() {
  const backend = createMockBackend({ delayMs: 0 });
  const fetchSpy = vi.fn(backend.fetch);
  const store = new ConversationStore(new ApiClient(fetchSpy), backend.openEvents, () => new Date('2026-10-23T12:00:00'));
  const assistants = () => store.getSnapshot().items.filter((item): item is AssistantItem => item.kind === 'assistant');
  return { store, fetchSpy, assistants };
}

describe('ConversationStore', () => {
  it('asks for the state, then the gov.br login, then shows the CNH', async () => {
    const { store, assistants } = setup();

    await store.send('Minha CNH vence quando?');
    expect(assistants().at(-1)?.card).toEqual({ type: 'uf' });
    expect(store.getSnapshot().offer).toEqual({ type: 'uf' });

    await store.send('sou de São Paulo');
    const login = assistants().at(-1)!;
    expect(store.getSnapshot().uf).toBe('SP');
    expect(login.card).toMatchObject({ type: 'login', liveViewUrl: 'about:blank', status: 'waiting' });
    expect(login.chips.map((chip) => chip.label)).toEqual(['Estado: SP', 'Esperando você entrar']);

    await store.simulateLogin();
    const cnh = assistants().at(-1)!;
    expect(cnh.card).toMatchObject({ type: 'cnh', cnh: { categoria: 'AB', situacao: 'regular' } });
    expect(cnh.text).toBe('Tudo certo com a sua CNH: está regular e vale até março de 2027. Quer o PDF?');
    expect(cnh.chips.map((chip) => chip.label)).toEqual(['Login gov.br', 'CNH encontrada', 'Lendo dados']);
    expect(assistants().find((item) => item.card?.type === 'login')?.card).toMatchObject({ status: 'done' });
  });

  it('only calls gerar_guia_multa after the user confirms', async () => {
    const { store, fetchSpy, assistants } = setup();
    await store.pickUf('SP');
    await store.send('Tenho multa?');
    await store.simulateLogin();

    const multas = assistants().at(-1)!;
    expect(multas.text).toBe(
      'Você tem 2 multas, somando 11 pontos de 30. A de 7 pontos sai da contagem em março. Dá pra pagar com 40% de desconto até dia 10. Quer o Pix?',
    );
    const card = multas.card;
    if (card?.type !== 'multas') throw new Error('expected multas card');

    await store.requestPix(card.multas[0]!);
    const confirm = assistants().at(-1)!;
    expect(confirm.card?.type).toBe('pixConfirm');
    const guideCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/gerar_guia_multa'));
    expect(guideCalls()).toHaveLength(0);

    await store.confirmPix(confirm.id);
    expect(guideCalls()).toHaveLength(1);
    const pix = assistants().at(-1)!;
    expect(pix.card).toMatchObject({ type: 'pix', guia: { multaId: 'm1' } });
    expect(pix.chips.map((chip) => chip.label)).toEqual([
      'Guia gerada', 'Validando multa', 'Calculando desconto SNE', 'Gerando Pix e boleto', 'Preparando PDF',
    ]);
    expect(pix.text).toBe(PIX_READY);
  });

  it('reads vehicles from the veiculos wrapper', async () => {
    const { store, assistants } = setup();
    await store.pickUf('SP');
    await store.send('Meu carro tá em dia?');
    await store.simulateLogin();
    const turn = assistants().at(-1)!;
    expect(turn.card).toMatchObject({ type: 'veiculo', veiculos: [{ placa: 'ABC1D23' }] });
    expect(turn.text).toBe('Seu Gol tem pendências: licenciamento pendente (vence 31/10/2026).');
  });

  it('downloads the CNH and creates a share link through the file endpoints', async () => {
    const { store, fetchSpy } = setup();
    await store.pickUf('SP');
    await store.send('Minha CNH');
    await store.simulateLogin();
    const file = await store.cnhDocument();
    expect(file).toMatchObject({ tipo: 'pdf', filename: 'cnh-digital.pdf' });
    const link = await store.cnhShareLink();
    expect(link.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
    expect(await store.cnhShareLink()).toBe(link);
    const shareCalls = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/share'));
    expect(shareCalls).toHaveLength(1);
  });

  it('waits for the aguardando_usuario event before continuing after a real login', async () => {
    const events: Array<(event: StepEvent) => void> = [];
    const backend = createMockBackend({ delayMs: 0 });
    const realLogin: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/tools/iniciar_login')) {
        return new Response(JSON.stringify({ ok: true, result: { liveViewUrl: 'https://live.example/view', loggedIn: false } }), {
          status: 200,
        });
      }
      return backend.fetch(input, init);
    };
    const store = new ConversationStore(new ApiClient(realLogin), (credentials, onEvent) => {
      events.push(onEvent);
      return backend.openEvents(credentials, onEvent);
    });
    await store.pickUf('SP');
    await store.send('Minha CNH');
    const login = store.lastAssistant()!;
    expect(login.card).toMatchObject({ type: 'login', status: 'waiting', liveViewUrl: 'https://live.example/view' });

    const emit = (status: StepEvent['status'], data?: unknown) =>
      events.forEach((listener) =>
        listener({ sessionId: 's', service: 'login', step: 'aguardando_usuario', status, data, at: new Date().toISOString() }),
      );
    emit('error', { code: 'LOGIN_TIMEOUT' });
    expect(store.lastAssistant()?.card).toMatchObject({ status: 'expired' });
    expect(store.lastAssistant()?.text).toBe('O tempo para entrar no gov.br acabou. Quer tentar de novo?');
  });

  it('runs voice tool calls, renders their cards and returns the envelope to the model', async () => {
    const { store, assistants } = setup();
    const noUf = await store.voiceTool('consultar_cnh', {});
    expect(noUf).toMatchObject({ ok: false, code: 'UF_REQUIRED', next: { tool: 'selecionar_uf' } });

    store.voiceUserSaid('Sou de São Paulo');
    expect(await store.voiceTool('selecionar_uf', { uf: 'SP' })).toEqual({ ok: true, result: { uf: 'SP' } });
    expect(store.getSnapshot().uf).toBe('SP');

    const loginDone = vi.fn();
    store.onLoginDone(loginDone);
    const login = await store.voiceTool('iniciar_login', {});
    expect(login).toMatchObject({ ok: true, result: { loggedIn: true } });
    await store.simulateLogin();
    expect(loginDone).toHaveBeenCalledTimes(1);

    const multas = await store.voiceTool('listar_multas', {});
    expect(multas).toMatchObject({ ok: true, result: { pontos: { total: 11 } } });
    expect(assistants().at(-1)?.card?.type).toBe('multas');
    store.voiceAssistantSaid('Você tem 2 multas, somando 11 pontos.');
    expect(assistants().at(-1)?.text).toBe('Você tem 2 multas, somando 11 pontos.');

    await store.voiceTool('gerar_guia_multa', { multaId: 'm1' });
    expect(assistants().at(-1)?.card).toMatchObject({ type: 'pix', multa: { id: 'm1' } });
    expect(await store.voiceTool('apagar_tudo', {})).toMatchObject({ ok: false, code: 'UNKNOWN_TOOL' });
  });

  it('clears the conversation and deletes the server session', async () => {
    const { store, fetchSpy } = setup();
    await store.pickUf('RJ');
    await store.reset();
    expect(store.getSnapshot().items).toEqual([]);
    expect(fetchSpy.mock.calls.some(([url, init]) => url === '/session' && init?.method === 'DELETE')).toBe(true);
  });
});
