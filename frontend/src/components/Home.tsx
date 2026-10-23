import { useEffect, useState } from 'react';
import { SUGGESTIONS } from '../conversation/copy';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Composer } from './Composer';
import { Header } from './Header';
import { Mist } from './Mist';

const IDEAS = [
  'Minha CNH vence quando?',
  'Tenho multa? Quantos pontos eu tenho?',
  'Gera o Pix da minha multa com desconto',
  'Meu carro está com IPVA atrasado?',
  'Tem recall no meu carro?',
  'Baixa o PDF da minha CNH',
];

function useTypewriter(ideas: string[], paused: boolean): string {
  const [state, setState] = useState({ index: 0, chars: 0, deleting: false });
  useEffect(() => {
    if (paused) return;
    const text = ideas[state.index] ?? '';
    let delay = state.deleting ? 28 : 55;
    let next = state;
    if (!state.deleting && state.chars < text.length) next = { ...state, chars: state.chars + 1 };
    else if (!state.deleting) {
      next = { ...state, deleting: true };
      delay = 1600;
    } else if (state.chars > 0) next = { ...state, chars: state.chars - 1 };
    else {
      next = { index: (state.index + 1) % ideas.length, chars: 0, deleting: false };
      delay = 400;
    }
    const timer = setTimeout(() => setState(next), delay);
    return () => clearTimeout(timer);
  }, [ideas, paused, state]);
  if (paused) return ideas[0] ?? '';
  return `${(ideas[state.index] ?? '').slice(0, state.chars)}▍`;
}

type HomeProps = {
  onSend: (text: string) => void;
  onMic: () => void;
  micDisabled?: boolean;
};

export function Home({ onSend, onMic, micDisabled }: HomeProps) {
  const reduced = useReducedMotion();
  const placeholder = useTypewriter(IDEAS, reduced);
  const [mistSize, setMistSize] = useState(() => mistFor(window.innerWidth, window.innerHeight));

  useEffect(() => {
    const resize = () => setMistSize(mistFor(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <>
      <Header />
      <main className="home">
        <div className="home__intro">
          <h1 className="home__title">Olá, Brasil</h1>
          <p className="home__subtitle">Tudo do governo num lugar só</p>
        </div>
        <div className="home__stage">
          <Mist variant="hero" size={mistSize} />
        </div>
        <div className="home__bottom">
          <div className="tries">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="try-chip" onClick={() => onSend(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
          <Composer
            large
            label="O que você precisa?"
            placeholder={placeholder}
            onSend={onSend}
            onMic={onMic}
            micDisabled={micDisabled}
          />
          <p className="privacy">
            Seus dados ficam só nesta conversa, não são salvos em banco e somem após 30 minutos sem uso. Este
            assistente não é um site oficial do governo.
          </p>
        </div>
      </main>
    </>
  );
}

function mistFor(width: number, height: number): number {
  return Math.round(Math.max(300, Math.min(460, width * 0.9, height * 0.5)));
}
