import type { VoiceBridge, VoiceHandlers } from './types';

type ServerEvent = { type: string; [key: string]: unknown };
type Send = (event: Record<string, unknown>) => void;

export const LOGIN_DONE_NOTICE = 'Aviso do app: o usuário concluiu o login no gov.br. Continue de onde parou.';

export class RealtimeEventHandler {
  private userText = '';
  private assistantText = '';
  private readonly pendingCalls = new Map<string, Promise<unknown>>();
  private responseActive = false;

  constructor(
    private readonly send: Send,
    private readonly bridge: VoiceBridge,
    private readonly handlers: VoiceHandlers,
  ) {}

  handle(event: ServerEvent) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.userText = '';
        this.handlers.onUserText('', false);
        this.handlers.onMode('ouvindo');
        return;
      case 'input_audio_buffer.speech_stopped':
      case 'input_audio_buffer.committed':
        this.handlers.onMode('pensando');
        return;
      case 'conversation.item.input_audio_transcription.delta':
        this.userText += String(event.delta ?? '');
        this.handlers.onUserText(this.userText, false);
        return;
      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(event.transcript ?? this.userText).trim();
        this.userText = '';
        this.handlers.onUserText(text, true);
        this.bridge.userSaid(text);
        return;
      }
      case 'response.created':
        this.responseActive = true;
        this.assistantText = '';
        this.handlers.onMode('pensando');
        return;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        this.assistantText += String(event.delta ?? '');
        this.handlers.onAssistantText(this.assistantText, false);
        this.handlers.onMode('falando');
        return;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const text = String(event.transcript ?? this.assistantText).trim();
        this.assistantText = '';
        this.handlers.onAssistantText(text, true);
        this.bridge.assistantSaid(text);
        return;
      }
      case 'output_audio_buffer.started':
        this.handlers.onMode('falando');
        return;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        if (!this.responseActive && this.pendingCalls.size === 0) this.handlers.onMode('ouvindo');
        return;
      case 'response.function_call_arguments.done':
        this.startCall(String(event.call_id ?? ''), String(event.name ?? ''), String(event.arguments ?? '{}'));
        return;
      case 'response.done':
        this.responseActive = false;
        void this.finishResponse();
        return;
      case 'error':
        this.handlers.onError(event.error);
        return;
      default:
        return;
    }
  }

  notifyLoginDone() {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: LOGIN_DONE_NOTICE }] },
    });
    this.send({ type: 'response.create' });
  }

  private startCall(callId: string, name: string, rawArgs: string) {
    if (!callId) return;
    this.handlers.onMode('pensando');
    let args: unknown = {};
    try {
      args = JSON.parse(rawArgs || '{}');
    } catch {
      args = {};
    }
    this.pendingCalls.set(callId, this.bridge.runTool(name, args));
  }

  private async finishResponse() {
    if (this.pendingCalls.size === 0) {
      this.handlers.onMode('ouvindo');
      return;
    }
    const calls = [...this.pendingCalls.entries()];
    this.pendingCalls.clear();
    for (const [callId, promise] of calls) {
      const output = await promise.catch(() => ({ ok: false, code: 'INTERNAL', message: 'Falha na consulta.' }));
      this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
    }
    this.send({ type: 'response.create' });
  }
}
