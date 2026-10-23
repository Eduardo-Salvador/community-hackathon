import type { Multa, ResumoPontos } from '../../api/types';
import { brl, dateBR, monthYearShort } from '../../lib/format';
import { GRAVIDADE } from '../../lib/points';
import { PointsSummary } from './PointsSummary';

export function MultasCard({ multas, resumo }: { multas: Multa[]; resumo: ResumoPontos }) {
  return (
    <>
      <PointsSummary resumo={resumo} />
      {multas.length > 0 && (
        <ul className="fines" aria-label="Multas" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {multas.map((multa, index) => {
            const gravidade = GRAVIDADE[multa.gravidade];
            return (
              <li key={multa.id} className="fine">
                <div className="fine__badge" style={{ background: gravidade.tone.bg, color: gravidade.tone.fg }}>
                  <strong>{multa.pontos}</strong>
                  <span>pts</span>
                </div>
                <div className="fine__info">
                  <strong>{multa.descricao}</strong>
                  <span>
                    {gravidade.label} · {dateBR(multa.data)} · sai da contagem em {monthYearShort(multa.expiraContagemEm)}
                  </span>
                </div>
                <div className="fine__price">
                  {multa.valorComDesconto !== undefined ? (
                    <>
                      <s>{brl(multa.valor)}</s>
                      <strong>{brl(multa.valorComDesconto)}</strong>
                    </>
                  ) : (
                    <strong>{brl(multa.valor)}</strong>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
