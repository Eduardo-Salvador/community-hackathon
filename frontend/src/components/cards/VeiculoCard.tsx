import { useState } from 'react';
import type { Veiculo } from '../../api/types';
import { useStore } from '../../conversation/context';
import { isVehicleClear } from '../../conversation/copy';
import { brl, capitalize, dateBR, lowerFirst } from '../../lib/format';
import { TONES } from '../../lib/points';
import { AlertIcon, DownloadIcon } from '../icons';

export function VeiculoCard({ veiculos, uf }: { veiculos: Veiculo[]; uf?: string }) {
  return (
    <>
      {veiculos.map((veiculo) => (
        <VehiclePanel key={veiculo.placa} veiculo={veiculo} uf={uf} />
      ))}
    </>
  );
}

function VehiclePanel({ veiculo, uf }: { veiculo: Veiculo; uf?: string }) {
  const store = useStore();
  const [error, setError] = useState<string>();
  const clear = isVehicleClear(veiculo);
  const downloadCrlv = async () => {
    if (!veiculo.crlvFileId) return;
    setError(undefined);
    try {
      await store.downloadFile(veiculo.crlvFileId, `crlv-${veiculo.placa}`);
    } catch {
      setError('Não consegui baixar o CRLV agora. Tente de novo.');
    }
  };
  const tone = clear ? TONES.ok : TONES.warn;
  const model = veiculo.modelo.replace(/\s(\d{4})$/, ' · $1');
  return (
    <div className="panel" style={{ gap: 18 }}>
      <div className="vehicle__head">
        <div className="vehicle__title">
          <span className="vehicle__model">{model}</span>
          <span className="vehicle__plate">{veiculo.placa}</span>
        </div>
        <span className="status-pill" style={{ background: tone.bg, color: tone.fg }}>
          {clear ? 'Em dia' : 'Com pendências'}
        </span>
      </div>
      <div className="stats">
        <Stat
          label="Licenciamento"
          value={veiculo.licenciamento.pago ? 'Pago' : 'Pendente'}
          sub={`${veiculo.licenciamento.pago ? 'Próximo' : 'Vence'}: ${dateBR(veiculo.licenciamento.vencimento)}`}
        />
        <Stat label="IPVA em aberto" value={brl(veiculo.ipvaEmAberto)} sub={uf ?? ''} />
        <Stat
          label="Restrições"
          value={veiculo.restricoes.length === 0 ? 'Nenhuma' : String(veiculo.restricoes.length)}
          sub={veiculo.restricoes.length === 0 ? 'Sem bloqueio' : veiculo.restricoes.join(', ')}
        />
      </div>
      {veiculo.recall.map((recall) => (
        <div key={recall} className="notice" style={{ background: TONES.warn.bg }}>
          <AlertIcon size={20} color={TONES.warn.fg} style={{ flexShrink: 0 }} />
          <div className="notice__text">
            <strong style={{ color: TONES.warn.fg }}>Recall pendente: {lowerFirst(recall)}</strong>
            <span>Agende o reparo gratuito numa concessionária da marca.</span>
          </div>
        </div>
      ))}
      {veiculo.crlvFileId && (
        <button
          type="button"
          className="btn btn--primary"
          style={{ alignSelf: 'flex-start' }}
          onClick={downloadCrlv}
        >
          <DownloadIcon />
          Baixar CRLV digital
        </button>
      )}
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{capitalize(value)}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  );
}
