export type VoiceMode = 'conectando' | 'ouvindo' | 'pensando' | 'falando';

export type VoiceHandlers = {
  onMode: (mode: VoiceMode) => void;
  onUserText: (text: string, final: boolean) => void;
  onAssistantText: (text: string, final: boolean) => void;
  onError: (error: unknown) => void;
};

export interface VoiceClient {
  start(handlers: VoiceHandlers): Promise<void>;
  submit(): void;
  cancel(): void;
  interrupt(): void;
  setMuted(muted: boolean): void;
  stop(): void;
}

export type VoiceBridge = {
  runTool: (name: string, args: unknown) => Promise<unknown>;
  userSaid: (text: string) => void;
  assistantSaid: (text: string) => void;
  onLoginDone: (listener: () => void) => () => void;
};
