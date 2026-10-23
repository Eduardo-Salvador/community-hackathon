import type { Cnh } from '../../api/types';
import { useId, useState, type CSSProperties } from 'react';
import { useStore } from '../../conversation/context';
import { dateBR, initials, shortName, titleCase } from '../../lib/format';
import { DownloadIcon } from '../icons';
import { ShareMenu, type ShareTarget } from '../ShareMenu';

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

function maskRegistro(registro: string): string {
  return `•••• ${registro.slice(-5)}`;
}

export function CnhCard({ cnh }: { cnh: Cnh }) {
  const store = useStore();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState(false);

  const download = async () => {
    setDownloading(true);
    setError(undefined);
    try {
      const file = await store.downloadCnh();
      setReceipt(file.tipo === 'comprovante');
    } catch {
      setError('Não consegui baixar agora. Tente de novo.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <CnhVisual cnh={cnh} />
      <div className="after">
        <button type="button" className="btn btn--primary" onClick={download} disabled={downloading}>
          <DownloadIcon />
          {downloading ? 'Baixando…' : 'Baixar CNH digital'}
        </button>
        <CnhShare onError={setError} />
        <button type="button" className="btn" onClick={() => store.send('Ver minhas multas')}>
          Ver minhas multas
        </button>
      </div>
      {receipt && (
        <span className="hint">O portal não liberou o PDF agora, então baixei um comprovante (imagem da tela da CNH).</span>
      )}
      {error && <span className="inline-error">{error}</span>}
    </>
  );
}

function CnhVisual({ cnh }: { cnh: Cnh }) {
  const grainId = `cnh-grain-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const regular = cnh.situacao === 'regular';
  return (
    <div className="cnh-wrap">
      <div
        className="cnh"
        role="img"
        aria-label={`Resumo da CNH de ${titleCase(cnh.nome)}: categoria ${cnh.categoria}, válida até ${dateBR(cnh.validade)}, situação ${cnh.situacao}`}
      >
        <svg className="cnh__grain" aria-hidden="true">
          <filter id={grainId}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${grainId})`} />
        </svg>
        <div className="cnh__shine" aria-hidden="true" />
        <div className="cnh__band f" style={delay(0.7)}>
          <div className="cnh__band-title">
            <strong>Brasil · Trânsito</strong>
            <span>Resumo para consulta</span>
          </div>
          <span className="cnh__seal">BR</span>
        </div>
        <div className="cnh__heading f" style={delay(0.9)}>
          Carteira Nacional de Habilitação
        </div>
        <div className="cnh__main">
          <div className="cnh__side f" style={delay(0.8)}>
            <span>Visualização · não é documento</span>
          </div>
          <div className="cnh__photo-col f" style={delay(0.95)}>
            <div className="cnh__photo">{initials(cnh.nome)}</div>
            <div className="cnh__signature">{titleCase(shortName(cnh.nome))}</div>
          </div>
          <div className="cnh__fields">
            <Field label="2 e 1 · Nome" value={cnh.nome.toUpperCase()} wide at={1.1} />
            <Field label="4b · Validade" value={dateBR(cnh.validade)} alert at={1.25} />
            <Field label="5 · Nº registro" value={maskRegistro(cnh.registro)} alert at={1.4} />
            <Field label="9 · Cat. hab." value={cnh.categoria} alert at={1.55} />
            <Field label="Situação" value={cnh.situacao.toUpperCase()} tone={regular ? 'ok' : 'alert'} at={1.7} />
          </div>
        </div>
      </div>
    </div>
  );
}

type FieldProps = { label: string; value: string; at: number; wide?: boolean; alert?: boolean; tone?: 'ok' | 'alert' };

function Field({ label, value, at, wide, alert, tone }: FieldProps) {
  const valueTone = tone ?? (alert ? 'alert' : undefined);
  return (
    <div className={`cnh__field f${wide ? ' cnh__field--wide' : ''}`} style={delay(at)}>
      <span className="cnh__field-label">{label}</span>
      <span className={`cnh__field-value${valueTone ? ` cnh__field-value--${valueTone}` : ''}`}>{value}</span>
    </div>
  );
}

function CnhShare({ onError }: { onError: (message?: string) => void }) {
  const store = useStore();

  const load = async (): Promise<ShareTarget> => {
    const link = await store.cnhShareLink();
    return { whatsappUrl: link.whatsappUrl, emailUrl: link.emailUrl, copy: link.url };
  };

  const nativeShare = async () => {
    const document = await store.cnhDocument();
    const file = new File([document.blob], document.filename, { type: document.blob.type || 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'CNH digital' });
      return;
    }
    const link = await store.cnhShareLink();
    await navigator.share({ title: 'CNH digital', text: link.texto });
  };

  return (
    <ShareMenu
      load={load}
      nativeShare={nativeShare}
      copyLabel="Copiar link"
      copiedLabel="Link copiado"
      note="O link do PDF expira em 15 minutos. No celular, abre o compartilhar do próprio aparelho."
      onError={onError}
    />
  );
}
