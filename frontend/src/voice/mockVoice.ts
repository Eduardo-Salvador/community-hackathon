import type { ApiClient } from '../api/client';
import type { VoiceClient, VoiceHandlers } from './types';

const TYPE_DELAY_MS = 45;

export type MockConversation = {
  send: (text: string) => Promise<void>;
  lastAssistantText: () => string | undefined;
  nextUtterance: () => string;
};

export class MockVoiceClient implements VoiceClient {
  private handlers?: VoiceHandlers;
  private utterance = '';
  private typed = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private finishSpeaking?: () => void;
  private run = 0;

  constructor(
    private readonly api: ApiClient,
    private readonly conversation: MockConversation,
  ) {}

  async start(handlers: VoiceHandlers): Promise<void> {
    this.handlers = handlers;
    handlers.onMode('conectando');
    await this.api.voiceToken();
    this.listen();
  }

  submit(): void {
    void this.respond();
  }

  cancel(): void {
    this.listen();
  }

  interrupt(): void {
    this.stopSpeaking();
    this.listen();
  }

  stop(): void {
    this.run += 1;
    this.stopTyping();
    this.stopSpeaking();
    this.handlers = undefined;
  }

  private listen() {
    const handlers = this.handlers;
    if (!handlers) return;
    this.run += 1;
    this.stopTyping();
    this.utterance = this.conversation.nextUtterance();
    this.typed = 0;
    handlers.onMode('ouvindo');
    handlers.onUserText('', false);
    const tick = () => {
      this.typed += 1;
      handlers.onUserText(this.utterance.slice(0, this.typed), false);
      if (this.typed < this.utterance.length) this.timer = setTimeout(tick, TYPE_DELAY_MS);
    };
    this.timer = setTimeout(tick, 600);
  }

  private async respond() {
    const handlers = this.handlers;
    if (!handlers || !this.utterance) return;
    this.stopTyping();
    const text = this.utterance;
    this.utterance = '';
    const current = ++this.run;
    handlers.onUserText(text, true);
    handlers.onMode('pensando');
    await this.conversation.send(text);
    if (current !== this.run) return;
    const reply = this.conversation.lastAssistantText();
    if (!reply) return this.listen();
    handlers.onAssistantText(reply, true);
    handlers.onMode('falando');
    await this.speak(reply);
    if (current === this.run) this.listen();
  }

  private speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const fallback = setTimeout(done, Math.min(9000, 1200 + text.length * 55));
      function done() {
        clearTimeout(fallback);
        resolve();
      }
      this.finishSpeaking = done;
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      const voice = synth.getVoices().find((candidate) => candidate.lang === 'pt-BR');
      if (voice) utterance.voice = voice;
      utterance.onend = done;
      utterance.onerror = done;
      synth.speak(utterance);
    });
  }

  private stopSpeaking() {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    const finish = this.finishSpeaking;
    this.finishSpeaking = undefined;
    finish?.();
  }

  private stopTyping() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
