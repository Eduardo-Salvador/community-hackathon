import { useId } from 'react';
import type { VoiceMode } from '../voice/types';

type MistProps = {
  variant: 'hero' | 'avatar' | 'voice';
  size: number;
  mode?: VoiceMode;
  busy?: boolean;
};

const BLUR = { hero: [34, 36, 36], avatar: [5, 5, 5], voice: [30, 32, 32] } as const;

export function Mist({ variant, size, mode, busy }: MistProps) {
  const grainId = `grain-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [blurA, blurB, blurC] = BLUR[variant];
  const classes = ['mist', `mist--${variant}`, mode && `mist--${mode}`, busy && 'mist--busy'].filter(Boolean).join(' ');
  return (
    <div className={classes} style={{ width: size, height: size }} aria-hidden="true">
      <div className="mist__blob mist__blob--a" style={{ filter: `blur(${blurA}px)` }} />
      <div
        className="mist__blob mist__blob--b"
        style={{ filter: `blur(${blurB}px)`, background: mode === 'pensando' ? '#F2DC8A' : undefined }}
      />
      <div className="mist__blob mist__blob--c" style={{ filter: `blur(${blurC}px)` }} />
      {variant !== 'avatar' && (
        <svg className="mist__grain">
          <filter id={grainId}>
            <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${grainId})`} />
        </svg>
      )}
    </div>
  );
}
