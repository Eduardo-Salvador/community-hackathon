import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/client';
import { useStore } from '../conversation/context';
import { thinkingCaption } from '../conversation/copy';
import { TONES } from '../lib/points';
import type { VoiceClient, VoiceMode as Mode } from '../voice/types';
import { LoginCard } from './cards/LoginCard';
import { Header } from './Header';
import { CloseIcon, KeyboardIcon } from './icons';
import { Mist } from './Mist';

const MODES: Record<Mode, { label: string; tone: { bg: string; fg: string }; action: string }> = {
  conectando: { label: 'Conectando', tone: TONES.neutral, action: 'Conectando…' },
  ouvindo: { label: 'Ouvindo', tone: TONES.ok, action: 'Parar e enviar' },
  pensando: { label: 'Consultando o DETRAN', tone: TONES.warn, action: 'Cancelar' },
  falando: { label: 'Respondendo', tone: TONES.neutral, action: 'Interromper e falar' },
};

const LISTEN_HINT = 'Fale do seu jeito. Toque para parar quando terminar.';

function voiceMistSize(): number {
  return Math.round(Math.max(160, Math.min(380, window.innerWidth * 0.8, window.innerHeight * 0.38)));
}

function splitFirstSentence(text: string): [string, string] {
  const match = text.match(/^(.+?[.!?])\s+(.*)$/s);
  return match ? [match[1] ?? text, match[2] ?? ''] : [text, ''];
}

function failureMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Permita o uso do microfone para falar.';
  if (error instanceof ApiError && error.code === 'VOICE_LIMIT_REACHED') return 'Você atingiu o limite de conversas por voz.';
  return 'A voz não está disponível agora.';
}

type VoiceModeProps = {
  voice: VoiceClient;
  onExit: () => void;
  onEnd: () => void;
  onUnavailable: () => void;
};

export function VoiceMode({ voice, onExit, onEnd, onUnavailable }: VoiceModeProps) {
  const store = useStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [mode, setMode] = useState<Mode>('conectando');
  const [userText, setUserText] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [failure, setFailure] = useState<string>();
  const callbacks = useRef({ onUnavailable });
  callbacks.current = { onUnavailable };

  useEffect(() => {
    let alive = true;
    const fail = (error: unknown) => {
      if (!alive) return;
      setFailure(failureMessage(error));
      if (error instanceof ApiError && error.code.startsWith('VOICE_')) callbacks.current.onUnavailable();
    };
    voice
      .start({
        onMode: (next) => alive && setMode(next),
        onUserText: (text) => {
          if (!alive) return;
          setUserText(text);
          if (text) setAssistantText('');
        },
        onAssistantText: (text) => alive && setAssistantText(text),
        onError: (error) => {
          if (error instanceof Error && error.message === 'VOICE_CONNECTION_LOST') fail(error);
        },
      })
      .catch(fail);
    return () => {
      alive = false;
      voice.stop();
    };
  }, [voice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onExit]);

  const primary = () => {
    if (mode === 'ouvindo') voice.submit();
    else if (mode === 'pensando') voice.cancel();
    else if (mode === 'falando') voice.interrupt();
  };

  const turn = store.lastAssistant();
  const pendingLogin = turn?.card?.type === 'login' && turn.card.status !== 'done' ? { id: turn.id, card: turn.card } : undefined;
  const liveSteps = mode === 'pensando' && turn?.busy ? turn.chips.map((chip) => chip.label).join(' · ') : '';
  const view = MODES[mode];

  let caption = 'Só um instante…';
  let sub = '';
  if (mode === 'ouvindo') {
    caption = userText ? `“${userText}”` : 'Pode falar…';
    sub = LISTEN_HINT;
  } else if (mode === 'pensando') {
    const intent = userText ? store.intentOf(userText) : undefined;
    caption = thinkingCaption(intent?.type === 'action' ? intent.action.type : undefined);
    sub = liveSteps;
  } else if (mode === 'falando') {
    [caption, sub] = splitFirstSentence(assistantText || turn?.text || '');
  }

  return (
    <div className="voice">
      <Header uf={state.uf} />
      <div className="voice__stage">
        {pendingLogin ? (
          <div className="voice__card">
            <LoginCard turn={pendingLogin.id} card={pendingLogin.card} />
          </div>
        ) : (
          <Mist variant="voice" size={voiceMistSize()} mode={mode === 'conectando' ? 'pensando' : mode} />
        )}
        {!failure && (
          <span className="voice__mode" style={{ background: view.tone.bg, color: view.tone.fg }}>
            {view.label}
          </span>
        )}
        <p className="voice__caption" aria-live="polite">
          {failure ?? caption}
        </p>
        <p className="voice__sub">{failure ? 'Use o teclado para continuar.' : sub}</p>
      </div>
      <div className="voice__controls">
        <button
          type="button"
          className="round-button"
          style={{ background: 'var(--field)' }}
          aria-label="Escrever em vez de falar"
          onClick={onExit}
        >
          <KeyboardIcon color="#0F1A15" />
        </button>
        <button
          type="button"
          className="btn btn--primary voice__main"
          onClick={primary}
          disabled={Boolean(failure) || mode === 'conectando'}
        >
          {failure ? 'Voz indisponível' : view.action}
        </button>
        <button
          type="button"
          className="round-button"
          style={{ background: 'var(--danger-soft)' }}
          aria-label="Encerrar conversa e apagar dados"
          onClick={onEnd}
        >
          <CloseIcon color="#8F1D13" />
        </button>
      </div>
    </div>
  );
}
