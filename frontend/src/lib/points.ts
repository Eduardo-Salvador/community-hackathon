import type { Gravidade, ResumoPontos } from '../api/types';

export type Tone = { bg: string; fg: string };

export const TONES = {
  ok: { bg: '#EEF5F0', fg: '#1F6B47' },
  warn: { bg: '#FBF3DC', fg: '#6B4E00' },
  danger: { bg: '#FDE8E5', fg: '#8F1D13' },
  neutral: { bg: '#F3F5F3', fg: '#1F2A24' },
} satisfies Record<string, Tone>;

const ALERTS: Record<ResumoPontos['alerta'], { label: string; tone: Tone; bar: string }> = {
  verde: { label: 'Tranquilo', tone: TONES.ok, bar: '#1F6B47' },
  amarelo: { label: 'Atenção', tone: TONES.warn, bar: '#C99A00' },
  vermelho: { label: 'Risco', tone: TONES.danger, bar: '#B42318' },
};

const LIMIT_REASONS: Record<ResumoPontos['limite'], string> = {
  40: 'você não tem multa gravíssima',
  30: 'você tem 1 multa gravíssima',
  20: 'você tem 2 ou mais multas gravíssimas',
};

export type PointsView = {
  total: number;
  limite: number;
  percent: number;
  label: string;
  tone: Tone;
  bar: string;
  attentionAt: number;
  riskAbove: number;
  attentionMark: number;
  riskMark: number;
  caption: string;
  ariaLabel: string;
};

export function pointsView({ total, limite, alerta }: ResumoPontos): PointsView {
  const percent = Math.min(100, Math.round((total / limite) * 100));
  const alert = ALERTS[alerta];
  const attentionAt = Math.round(limite * 0.5);
  const riskAbove = Math.round(limite * 0.8);
  return {
    total,
    limite,
    percent,
    label: `${alert.label} · ${percent}% do limite`,
    tone: alert.tone,
    bar: alert.bar,
    attentionAt,
    riskAbove,
    attentionMark: 50,
    riskMark: 80,
    caption: `Limite de ${limite} porque ${LIMIT_REASONS[limite]}. Atenção a partir de ${attentionAt}, risco acima de ${riskAbove}.`,
    ariaLabel: `${total} de ${limite} pontos, ${percent}% do limite`,
  };
}

export const GRAVIDADE: Record<Gravidade, { label: string; tone: Tone }> = {
  leve: { label: 'Leve', tone: TONES.ok },
  media: { label: 'Média', tone: TONES.ok },
  grave: { label: 'Grave', tone: TONES.warn },
  gravissima: { label: 'Gravíssima', tone: TONES.danger },
};
