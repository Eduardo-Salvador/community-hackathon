import { useEffect, useState } from 'react';

const TEXTS = ['Tenho multa?', 'Quando eu me aposento?', 'Como declaro meu IR?', 'Onde tomo vacina?', 'Quando sai a nota do ENEM?', 'Como vejo meu FGTS?'];
const LABELS = ["DETRAN · trânsito", "INSS · aposentadoria", "Receita · impostos", "SUS · saúde", "MEC · educação", "Trabalho · emprego"];
const SVGS = ["<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"62\" rx=\"18\" ry=\"2.5\" fill=\"#0F1A15\" opacity=\"0.08\"></ellipse><circle cx=\"32\" cy=\"36\" r=\"24\" fill=\"#009C3B\"></circle><ellipse cx=\"24\" cy=\"26\" rx=\"8\" ry=\"5\" fill=\"#FFFFFF\" opacity=\"0.22\"></ellipse><ellipse cx=\"25\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"39\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"20\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><ellipse cx=\"44\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><ellipse cx=\"32\" cy=\"15\" rx=\"17\" ry=\"6\" fill=\"#FFFFFF\" stroke=\"#0F1A15\" stroke-width=\"1.2\"></ellipse><rect x=\"17\" y=\"15\" width=\"30\" height=\"6\" rx=\"2\" fill=\"#002776\"></rect><path d=\"M16 21 Q32 27 48 21 L47 24 Q32 30 17 24Z\" fill=\"#0F1A15\"></path><rect x=\"29\" y=\"44\" width=\"9\" height=\"5\" rx=\"2.5\" fill=\"#FFDF00\" stroke=\"#0F1A15\" stroke-width=\"1\"></rect></svg>", "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"62\" rx=\"18\" ry=\"2.5\" fill=\"#0F1A15\" opacity=\"0.08\"></ellipse><circle cx=\"32\" cy=\"36\" r=\"24\" fill=\"#1E4FBF\"></circle><ellipse cx=\"24\" cy=\"26\" rx=\"8\" ry=\"5\" fill=\"#FFFFFF\" opacity=\"0.22\"></ellipse><circle cx=\"25\" cy=\"36\" r=\"5.5\" fill=\"none\" stroke=\"#0F1A15\" stroke-width=\"1.6\"></circle><circle cx=\"39\" cy=\"36\" r=\"5.5\" fill=\"none\" stroke=\"#0F1A15\" stroke-width=\"1.6\"></circle><path d=\"M30.5 36 L33.5 36\" stroke=\"#0F1A15\" stroke-width=\"1.6\"></path><circle cx=\"25\" cy=\"36\" r=\"1.6\" fill=\"#0F1A15\"></circle><circle cx=\"39\" cy=\"36\" r=\"1.6\" fill=\"#0F1A15\"></circle><path d=\"M24 47 Q28 44 32 46 Q36 44 40 47\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.5\" stroke-linecap=\"round\"></path><ellipse cx=\"32\" cy=\"13\" rx=\"14\" ry=\"4\" fill=\"#5C4A3A\"></ellipse><path d=\"M22 13 Q32 2 42 13Z\" fill=\"#5C4A3A\"></path></svg>", "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"62\" rx=\"18\" ry=\"2.5\" fill=\"#0F1A15\" opacity=\"0.08\"></ellipse><circle cx=\"32\" cy=\"36\" r=\"24\" fill=\"#FFDF00\"></circle><ellipse cx=\"24\" cy=\"26\" rx=\"8\" ry=\"5\" fill=\"#FFFFFF\" opacity=\"0.22\"></ellipse><ellipse cx=\"25\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"39\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"20\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><ellipse cx=\"44\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><path d=\"M12 22 Q32 6 52 22 L50 26 Q32 14 14 26Z\" fill=\"#1E4FBF\"></path><rect x=\"40\" y=\"44\" width=\"14\" height=\"16\" rx=\"2.5\" fill=\"#0F1A15\"></rect><rect x=\"42.5\" y=\"46.5\" width=\"9\" height=\"4\" rx=\"1\" fill=\"#9FD9B6\"></rect><circle cx=\"44\" cy=\"54\" r=\"1\" fill=\"#FFFFFF\"></circle><circle cx=\"47\" cy=\"54\" r=\"1\" fill=\"#FFFFFF\"></circle><circle cx=\"50\" cy=\"54\" r=\"1\" fill=\"#FFFFFF\"></circle></svg>", "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"62\" rx=\"18\" ry=\"2.5\" fill=\"#0F1A15\" opacity=\"0.08\"></ellipse><circle cx=\"32\" cy=\"36\" r=\"24\" fill=\"#FFFFFF\" stroke=\"#DCE5DD\" stroke-width=\"1.5\"></circle><ellipse cx=\"24\" cy=\"26\" rx=\"8\" ry=\"5\" fill=\"#FFFFFF\" opacity=\"0.22\"></ellipse><ellipse cx=\"25\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"39\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"20\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><ellipse cx=\"44\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><path d=\"M18 16 Q32 4 46 16 L44 20 L20 20Z\" fill=\"#FFFFFF\" stroke=\"#DCE5DD\" stroke-width=\"1.2\"></path><rect x=\"29.5\" y=\"9\" width=\"5\" height=\"10\" rx=\"1\" fill=\"#009C3B\"></rect><rect x=\"27\" y=\"11.5\" width=\"10\" height=\"5\" rx=\"1\" fill=\"#009C3B\"></rect></svg>", "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"62\" rx=\"18\" ry=\"2.5\" fill=\"#0F1A15\" opacity=\"0.08\"></ellipse><circle cx=\"32\" cy=\"36\" r=\"24\" fill=\"#009C3B\"></circle><ellipse cx=\"24\" cy=\"26\" rx=\"8\" ry=\"5\" fill=\"#FFFFFF\" opacity=\"0.22\"></ellipse><ellipse cx=\"25\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"39\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"20\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><ellipse cx=\"44\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><path d=\"M12 14 L32 6 L52 14 L32 22Z\" fill=\"#0F1A15\"></path><rect x=\"24\" y=\"16\" width=\"16\" height=\"7\" rx=\"1\" fill=\"#0F1A15\"></rect><path d=\"M50 14 L50 24\" stroke=\"#FFDF00\" stroke-width=\"1.5\"></path><circle cx=\"50\" cy=\"25\" r=\"2\" fill=\"#FFDF00\"></circle></svg>", "<svg width=\"64\" height=\"64\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><ellipse cx=\"32\" cy=\"62\" rx=\"18\" ry=\"2.5\" fill=\"#0F1A15\" opacity=\"0.08\"></ellipse><circle cx=\"32\" cy=\"36\" r=\"24\" fill=\"#1E4FBF\"></circle><ellipse cx=\"24\" cy=\"26\" rx=\"8\" ry=\"5\" fill=\"#FFFFFF\" opacity=\"0.22\"></ellipse><ellipse cx=\"25\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"39\" cy=\"36\" rx=\"2.8\" ry=\"4\" fill=\"#0F1A15\"></ellipse><ellipse cx=\"20\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><ellipse cx=\"44\" cy=\"43\" rx=\"3.5\" ry=\"2\" fill=\"#FF8FA3\" opacity=\"0.55\"></ellipse><path d=\"M12 20 Q12 6 32 6 Q52 6 52 20Z\" fill=\"#FFDF00\"></path><rect x=\"10\" y=\"18\" width=\"44\" height=\"4\" rx=\"2\" fill=\"#E0B000\"></rect><rect x=\"30\" y=\"6\" width=\"4\" height=\"12\" rx=\"1\" fill=\"#E0B000\"></rect></svg>"];
const X = [30, 21, 31, 66, 76, 65];
const Y = [290, 470, 650, 270, 470, 660];
const BUBBLE_SIDE = ['right', 'right', 'right', 'left', 'left', 'left'] as const;
const BUBBLE_TOP = [0, 12, 0, 0, 12, 0];
const ROT = [-2, 2, -3, 2, -2, 3];
const HEIGHT = 866;
const CENTER_Y = 486;
const WIDTH = 1408;

type Bubble = { chars: number; phase: 'wait' | 'type' | 'hold' | 'erase'; t: number };

function useBubbles(paused: boolean): Bubble[] {
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    TEXTS.map((text, n) => (paused ? { chars: text.length, phase: 'hold', t: 0 } : { chars: 0, phase: 'wait', t: -n * 4 })),
  );
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setBubbles((prev) =>
        prev.map((b, n) => {
          const text = TEXTS[n] ?? '';
          const t = b.t + 1;
          if (b.phase === 'wait' && t > 0) return { chars: 0, phase: 'type', t: 0 };
          if (b.phase === 'type') return b.chars < text.length ? { ...b, chars: b.chars + 1, t } : { ...b, phase: 'hold', t: 0 };
          if (b.phase === 'hold' && t > 36 + n * 4) return { ...b, phase: 'erase', t: 0 };
          if (b.phase === 'erase') return b.chars > 0 ? { ...b, chars: b.chars - 2, t } : { chars: 0, phase: 'wait', t: -2 };
          return { ...b, t };
        }),
      );
    }, 50);
    return () => clearInterval(timer);
  }, [paused]);
  return bubbles;
}

function lineEnd(n: number) {
  const x = X[n] ?? 0;
  const y = Y[n] ?? 0;
  const cx = (x + 2.3) * (WIDTH / 100);
  const cy = y + 32;
  const dx = 50 * (WIDTH / 100) - cx;
  const dy = CENTER_Y - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x1: x + 2.3, y1: cy, x2: (50 * (WIDTH / 100) - (dx / len) * 205) / (WIDTH / 100), y2: CENTER_Y - (dy / len) * 205 };
}

export function Mascots({ paused }: { paused: boolean }) {
  const bubbles = useBubbles(paused);
  return (
    <div className="mascots" aria-hidden="true">
      <svg className="mascots__lines" viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none">
        {X.map((_, n) => {
          const l = lineEnd(n);
          return <line key={n} {...l} stroke="#9FD9B6" strokeWidth="1.5" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      {X.map((x, n) => {
        const b = bubbles[n];
        const side = BUBBLE_SIDE[n];
        return (
          <div
            key={LABELS[n]}
            className={`mascot mascot--${(n % 4) + 1}`}
            title={LABELS[n]}
            style={{ left: `${x}%`, top: `${((Y[n] ?? 0) / HEIGHT) * 100}%` }}
          >
            <div
              className="mascot__bubble"
              style={{ ...(side === 'right' ? { right: 72 } : { left: 72 }), top: BUBBLE_TOP[n], transform: `rotate(${ROT[n]}deg)` }}
            >
              {(TEXTS[n] ?? '').slice(0, Math.max(0, b?.chars ?? 0))}
              <span className="mascot__caret" style={{ opacity: b?.phase === 'hold' ? 0 : 1 }} />
            </div>
            <span dangerouslySetInnerHTML={{ __html: SVGS[n] ?? '' }} />
          </div>
        );
      })}
    </div>
  );
}
