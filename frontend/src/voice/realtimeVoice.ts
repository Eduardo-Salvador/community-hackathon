import type { ApiClient } from '../api/client';
import { RealtimeEventHandler } from './realtimeEvents';
import type { VoiceBridge, VoiceClient, VoiceHandlers } from './types';

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

export class RealtimeVoiceClient implements VoiceClient {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private microphone?: MediaStream;
  private audio?: HTMLAudioElement;
  private unsubscribe?: () => void;
  private handler?: RealtimeEventHandler;

  constructor(
    private readonly api: ApiClient,
    private readonly bridge: VoiceBridge,
  ) {}

  async start(handlers: VoiceHandlers): Promise<void> {
    this.stop();
    handlers.onMode('conectando');
    const { token, model } = await this.api.voiceToken();
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.microphone = microphone;

    const peer = new RTCPeerConnection();
    this.peer = peer;
    const audio = new Audio();
    audio.autoplay = true;
    this.audio = audio;
    peer.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? null;
    };
    microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone));

    const channel = peer.createDataChannel('oai-events');
    this.channel = channel;
    const handler = new RealtimeEventHandler((event) => this.send(event), this.bridge, handlers);
    this.handler = handler;
    channel.addEventListener('message', (message) => {
      try {
        handler.handle(JSON.parse(String(message.data)));
      } catch {
        return;
      }
    });
    const opened = new Promise<void>((resolve, reject) => {
      channel.addEventListener('open', () => resolve(), { once: true });
      channel.addEventListener('error', () => reject(new Error('VOICE_CHANNEL_FAILED')), { once: true });
    });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch(`${CALLS_URL}?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      body: offer.sdp,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/sdp' },
    });
    if (!response.ok) throw new Error(`VOICE_CONNECT_FAILED_${response.status}`);
    await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    await opened;

    this.send({
      type: 'session.update',
      session: { type: 'realtime', audio: { input: { transcription: { model: TRANSCRIPTION_MODEL, language: 'pt' } } } },
    });
    this.unsubscribe = this.bridge.onLoginDone(() => handler.notifyLoginDone());
    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'failed') handlers.onError(new Error('VOICE_CONNECTION_LOST'));
    });
    handlers.onMode('ouvindo');
  }

  submit(): void {
    this.send({ type: 'input_audio_buffer.commit' });
    this.send({ type: 'response.create' });
  }

  cancel(): void {
    this.send({ type: 'response.cancel' });
  }

  interrupt(): void {
    this.send({ type: 'response.cancel' });
    this.send({ type: 'output_audio_buffer.clear' });
  }

  setMuted(muted: boolean): void {
    this.microphone?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.handler = undefined;
    this.channel?.close();
    this.peer?.close();
    this.microphone?.getTracks().forEach((track) => track.stop());
    if (this.audio) this.audio.srcObject = null;
    this.channel = undefined;
    this.peer = undefined;
    this.microphone = undefined;
    this.audio = undefined;
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event));
  }
}
