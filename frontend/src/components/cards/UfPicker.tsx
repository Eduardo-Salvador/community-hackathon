import { useSyncExternalStore } from 'react';
import { UF_LIST } from '../../api/types';
import { useStore } from '../../conversation/context';
import { CheckIcon } from '../icons';

export function UfPicker() {
  const store = useStore();
  const { uf } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (uf) {
    return (
      <div className="panel uf-picked">
        <span className="uf-picked__code">{uf}</span>
        <span className="hint">DETRAN-{uf}</span>
        <span className="uf-picked__ok">
          <CheckIcon size={14} />
          Estado definido
        </span>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="uf-grid" aria-label="Estados atendidos">
        {UF_LIST.map((code) => (
          <span key={code} className="uf-option">
            {code}
          </span>
        ))}
      </div>
      <span className="hint">Só fale: “sou de São Paulo”.</span>
    </div>
  );
}
