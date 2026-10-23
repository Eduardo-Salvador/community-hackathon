import { useEffect, useRef } from 'react';
import { ParticleField } from '../lib/particles';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Header } from './Header';
import { Mascots } from './Mascots';

type HomeProps = {
  onStart: () => void;
};

export function Home({ onStart }: HomeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!canvasRef.current) return;
    const field = new ParticleField(canvasRef.current);
    field.startParticles();
    return () => field.stop();
  }, []);

  return (
    <>
      <Header />
      <main className="start">
        <Mascots paused={reduced} />
        <canvas ref={canvasRef} className="start__particles" width={1040} height={1040} aria-hidden="true" />
        <div className="start__intro">
          <h1 className="start__title">Fala com a Tupi.</h1>
          <p className="start__subtitle">Ela resolve com o governo pra você.</p>
        </div>
        <button type="button" className="start__button" onClick={onStart}>
          <span className="start__flow" aria-hidden="true" />
          <span className="start__glaze" aria-hidden="true" />
          <span className="start__label">Iniciar</span>
        </button>
      </main>
    </>
  );
}
