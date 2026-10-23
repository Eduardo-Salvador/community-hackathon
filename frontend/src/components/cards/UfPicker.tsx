import { UF_LIST, type UF } from '../../api/types';
import { useState } from 'react';
import { useStore } from '../../conversation/context';

export function UfPicker() {
  const store = useStore();
  const [picked, setPicked] = useState<UF>();
  return (
    <div className="panel">
      <div className="uf-grid" role="group" aria-label="Estados">
        {UF_LIST.map((uf) => (
          <button
            key={uf}
            type="button"
            className="uf-option"
            aria-pressed={picked === uf}
            onClick={() => setPicked(uf)}
          >
            {uf}
          </button>
        ))}
      </div>
      <div className="panel__footer">
        <span className="hint">Ou só fale: “sou de São Paulo”.</span>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!picked}
          onClick={() => picked && store.pickUf(picked)}
        >
          {picked ? `Continuar com ${picked}` : 'Escolha seu estado'}
        </button>
      </div>
    </div>
  );
}
