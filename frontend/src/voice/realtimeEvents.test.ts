import { describe, expect, it, vi } from 'vitest';
import { LOGIN_DONE_NOTICE, RealtimeEventHandler } from './realtimeEvents';
import type { VoiceBridge, VoiceHandlers } from './types';

function setup(runTool: VoiceBridge['runTool'] = async () => ({ ok: true, result: { uf: 'SP' } })) {
  const sent: Array<Record<string, unknown>> = [];
  const bridge: VoiceBridge = {
    runTool: vi.fn(runTool),
    userSaid: vi.fn(),
    assistantSaid: vi.fn(),
    onLoginDone: () => () => undefined,
  };
  const handlers: VoiceHandlers = { onMode: vi.fn(), onUserText: vi.fn(), onAssistantText: vi.fn(), onError: vi.fn() };
  const handler = new RealtimeEventHandler((event) => sent.push(event), bridge, handlers);
  return { sent, bridge, handlers, handler };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RealtimeEventHandler', () => {
  it('runs tool calls through the backend and answers the model after the response ends', async () => {
    const { sent, bridge, handler } = setup();
    handler.handle({ type: 'response.created' });
    handler.handle({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'selecionar_uf', arguments: '{"uf":"SP"}' });
    expect(bridge.runTool).toHaveBeenCalledWith('selecionar_uf', { uf: 'SP' });
    expect(sent).toHaveLength(0);

    handler.handle({ type: 'response.done' });
    await flush();
    expect(sent).toEqual([
      { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'c1', output: '{"ok":true,"result":{"uf":"SP"}}' } },
      { type: 'response.create' },
    ]);
  });

  it('returns error envelopes to the model instead of failing', async () => {
    const { sent, handler } = setup(async () => {
      throw new Error('boom');
    });
    handler.handle({ type: 'response.function_call_arguments.done', call_id: 'c2', name: 'consultar_cnh', arguments: 'not json' });
    handler.handle({ type: 'response.done' });
    await flush();
    const output = JSON.parse(String((sent[0]?.item as { output: string }).output));
    expect(output).toMatchObject({ ok: false, code: 'INTERNAL' });
  });

  it('streams transcripts and hands final texts to the conversation', () => {
    const { bridge, handlers, handler } = setup();
    handler.handle({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Tenho ' });
    handler.handle({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Tenho multa?' });
    handler.handle({ type: 'response.output_audio_transcript.delta', delta: 'Você tem' });
    handler.handle({ type: 'response.output_audio_transcript.done', transcript: 'Você tem 2 multas.' });
    expect(handlers.onUserText).toHaveBeenCalledWith('Tenho ', false);
    expect(bridge.userSaid).toHaveBeenCalledWith('Tenho multa?');
    expect(handlers.onMode).toHaveBeenCalledWith('falando');
    expect(bridge.assistantSaid).toHaveBeenCalledWith('Você tem 2 multas.');
  });

  it('tells the model when the gov.br login is done', () => {
    const { sent, handler } = setup();
    handler.notifyLoginDone();
    expect(sent[0]).toMatchObject({ type: 'conversation.item.create', item: { content: [{ text: LOGIN_DONE_NOTICE }] } });
    expect(sent[1]).toEqual({ type: 'response.create' });
  });
});
