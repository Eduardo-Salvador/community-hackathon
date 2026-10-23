import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { pointsView } from '../../lib/points';
import { PointsSummary } from './PointsSummary';

describe('PointsSummary', () => {
  it('shows total, limit, green alert and bar for a calm count', () => {
    render(<PointsSummary resumo={{ total: 12, limite: 30, alerta: 'verde' }} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('/ 30 pontos')).toBeInTheDocument();
    const pill = screen.getByText('Tranquilo · 40% do limite');
    expect(pill).toHaveStyle({ color: '#1F6B47' });
    const bar = screen.getByRole('img', { name: '12 de 30 pontos, 40% do limite' });
    expect(bar.firstElementChild).toHaveStyle({ width: '40%' });
    expect(
      screen.getByText('Limite de 30 porque você tem 1 multa gravíssima. Atenção a partir de 15, risco acima de 24.'),
    ).toBeInTheDocument();
  });

  it('shows the risk alert in red', () => {
    render(<PointsSummary resumo={{ total: 18, limite: 20, alerta: 'vermelho' }} />);
    expect(screen.getByText('Risco · 90% do limite')).toHaveStyle({ color: '#8F1D13' });
    expect(screen.getByText(/Limite de 20 porque você tem 2 ou mais multas gravíssimas/)).toBeInTheDocument();
  });

  it('shows the attention alert in amber', () => {
    render(<PointsSummary resumo={{ total: 22, limite: 40, alerta: 'amarelo' }} />);
    expect(screen.getByText('Atenção · 55% do limite')).toHaveStyle({ color: '#6B4E00' });
  });
});

describe('pointsView', () => {
  it('caps the bar at 100% when over the limit', () => {
    expect(pointsView({ total: 45, limite: 40, alerta: 'vermelho' }).percent).toBe(100);
  });
});
