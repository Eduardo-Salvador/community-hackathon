import type { ResumoPontos } from '../../api/types';
import { pointsView } from '../../lib/points';

export function PointsSummary({ resumo }: { resumo: ResumoPontos }) {
  const view = pointsView(resumo);
  return (
    <div className="panel" style={{ gap: 14 }}>
      <div className="points__head">
        <span className="points__total">
          {view.total}
          <small> / {view.limite} pontos</small>
        </span>
        <span className="status-pill" style={{ background: view.tone.bg, color: view.tone.fg }}>
          {view.label}
        </span>
      </div>
      <div className="points__bar" role="img" aria-label={view.ariaLabel}>
        <div className="points__fill" style={{ width: `${view.percent}%`, background: view.bar }} />
        <span className="points__mark" style={{ left: `${view.attentionMark}%`, background: '#C99A00' }} />
        <span className="points__mark" style={{ left: `${view.riskMark}%`, background: '#B42318' }} />
      </div>
      <span className="points__caption">{view.caption}</span>
    </div>
  );
}
