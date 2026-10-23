import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/client';
import { useStore } from '../conversation/context';
import type { AssistantItem } from '../conversation/store';
import { ParticleField } from '../lib/particles';
import type { VoiceClient, VoiceMode as Mode } from '../voice/types';
import { CardView } from './cards/CardView';
import { Header } from './Header';
import { CloseIcon } from './icons';

const PARTICLE_MODE: Record<Mode, string> = {
  conectando: 'buscando',
  ouvindo: 'ouvindo',
  pensando: 'buscando',
  falando: 'respondendo',
};

const STATUS: Record<Mode, { label: string; dot: string }> = {
  conectando: { label: 'Conectando…', dot: '#E0B000' },
  ouvindo: { label: 'Ouvindo você…', dot: '#009C3B' },
  pensando: { label: 'Consultando o DETRAN…', dot: '#E0B000' },
  falando: { label: 'Tupi está falando', dot: '#1E4FBF' },
};

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
  const [muted, setMuted] = useState(false);
  const [userText, setUserText] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [failure, setFailure] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<ParticleField>();
  const callbacks = useRef({ onUnavailable });
  callbacks.current = { onUnavailable };

  useEffect(() => {
    if (!canvasRef.current) return;
    const field = new ParticleField(canvasRef.current);
    fieldRef.current = field;
    field.startParticles();
    return () => field.stop();
  }, []);

  useEffect(() => {
    if (fieldRef.current) fieldRef.current.mode = PARTICLE_MODE[mode];
  }, [mode]);

  useEffect(() => {
    let alive = true;
    const fail = (error: unknown) => {
      if (!alive) return;
      setFailure(failureMessage(error));
      if (error instanceof ApiError && error.code.startsWith('VOICE_')) callbacks.current.onUnavailable();
    };
    voice
      .start({
        onMode: (next) => {
          if (!alive) return;
          setMode(next);
          if (next === 'ouvindo') setMuted(false);
        },
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

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    voice.setMuted(next);
  };

  const turn = store.lastAssistant();
  const lastUser = [...state.items].reverse().find((item) => item.kind === 'user');
  const withCard = [...state.items]
    .reverse()
    .find((item): item is AssistantItem => item.kind === 'assistant' && Boolean(item.card));
  const said = userText || lastUser?.text || '';
  const speech = failure ?? (mode === 'falando' ? assistantText || turn?.text : turn?.text) ?? '';
  const status = muted && mode === 'ouvindo' ? { label: 'Microfone desligado', dot: '#6B7770' } : STATUS[mode];

  return (
    <div className="call">
      <Header uf={state.uf} onHome={onEnd} />
      <div className="call__stage">
        <div className="call__user" style={{ opacity: said ? 1 : 0 }}>
          <div className="call__bubble">
            <span className="call__who">Você</span>
            {said}
          </div>
        </div>
        <div className="call__center">
          <canvas ref={canvasRef} className="call__particles" width={1040} height={1040} aria-hidden="true" />
          <p className="call__speech" aria-live="polite">
            {speech}
          </p>
          {failure && (
            <button type="button" className="btn btn--ghost" onClick={onExit}>
              Usar o teclado
            </button>
          )}
        </div>
        <div className={`call__card${withCard?.card ? ' call__card--on' : ''}`}>
          {withCard?.card && <CardView turn={withCard.id} card={withCard.card} />}
        </div>
      </div>
      <div className="call__controls">
        <span className="call__status">
          <span className="call__dot" style={{ background: status.dot }} />
          {failure ? 'Voz indisponível' : status.label}
        </span>
        <button
          type="button"
          className={`call__round${muted ? ' call__round--muted' : ''}`}
          aria-label={muted ? 'Ligar microfone' : 'Desligar microfone'}
          aria-pressed={muted}
          onClick={toggleMute}
          disabled={Boolean(failure) || mode === 'conectando'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
            <path d="M19 11a7 7 0 0 1-14 0" />
            <path d="M12 18v3" />
            {muted && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <button type="button" className="call__round call__round--end" aria-label="Encerrar conversa e apagar dados" onClick={onEnd}>
          <CloseIcon color="#8F1D13" />
        </button>
      </div>
    </div>
  );
}
