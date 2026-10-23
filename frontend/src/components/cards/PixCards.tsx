import { useState } from 'react';
import type { Guia, Multa } from '../../api/types';
import { useStore } from '../../conversation/context';
import { copyText } from '../../lib/clipboard';
import { brl, dateBR } from '../../lib/format';
import { CopyIcon, DownloadIcon } from '../icons';
import { emailUrl, ShareMenu, whatsappUrl } from '../ShareMenu';

export function PixConfirm() {
  return <span className="hint">Diga “sim” para gerar o Pix ou “agora não” para deixar para depois.</span>;
}

const QR_PREFIX = 'data:image/png;base64,';

export function PixCard({ multa, guia }: { multa: Multa; guia: Guia }) {
  const store = useStore();
  const [copied, setCopied] = useState<'pix' | 'linha'>();
  const [failed, setFailed] = useState<string>();
  const [error, setError] = useState<string>();
  const amount = multa.valorComDesconto ?? multa.valor;
  const saving = multa.valorComDesconto !== undefined ? multa.valor - multa.valorComDesconto : 0;
  const due = multa.prazoDesconto ? ` · vence ${dateBR(multa.prazoDesconto)}` : '';
  const qr = guia.pixQrCode?.startsWith(QR_PREFIX) ? guia.pixQrCode : undefined;
  const shareText = guia.textoCompartilhar;

  const copy = async (kind: 'pix' | 'linha', text?: string) => {
    if (!text) return;
    const ok = await copyText(text);
    setCopied(ok ? kind : undefined);
    setFailed(ok ? undefined : text);
  };

  const download = async () => {
    if (!guia.pdfFileId) return;
    setError(undefined);
    try {
      await store.downloadFile(guia.pdfFileId, `guia-${multa.id}`);
    } catch {
      setError('Não consegui baixar o boleto agora.');
    }
  };

  return (
    <>
    <div className="panel pix">
      {(guia.pixCopiaECola || qr) && (
        <div className="pix__qr">
          {qr ? <img src={qr} alt="QR Code do Pix" /> : <span role="img" aria-label="QR Code do Pix">QR Code Pix</span>}
        </div>
      )}
      <div className="pix__details">
        <span className="pix__meta">
          {multa.descricao}
          {due}
        </span>
        <span className="pix__amount">{brl(amount)}</span>
        {saving > 0 && <span className="pix__saving">Você economiza {brl(saving)} com o SNE</span>}
        {guia.pixCopiaECola && (
          <button type="button" className="btn btn--primary" onClick={() => copy('pix', guia.pixCopiaECola)}>
            <CopyIcon />
            {copied === 'pix' ? 'Código copiado' : 'Copiar Pix copia e cola'}
          </button>
        )}
        <div className="row" style={{ gap: 8 }}>
          {guia.linhaDigitavel && (
            <button
              type="button"
              className={guia.pixCopiaECola ? 'btn btn--xs' : 'btn btn--primary'}
              onClick={() => copy('linha', guia.linhaDigitavel)}
            >
              {copied === 'linha' ? 'Linha copiada' : 'Copiar linha digitável'}
            </button>
          )}
          {guia.pdfFileId && (
            <button type="button" className="btn btn--xs" onClick={download}>
              <DownloadIcon size={16} />
              Baixar boleto
            </button>
          )}
          {shareText && (
            <ShareMenu
              load={async () => ({
                whatsappUrl: whatsappUrl(shareText),
                emailUrl: emailUrl(`Multa: ${multa.descricao}`, shareText),
                copy: shareText,
              })}
              nativeShare={() => navigator.share({ title: 'Pagamento da multa', text: shareText })}
              copyLabel="Copiar texto"
              copiedLabel="Texto copiado"
              small
              onError={setError}
            />
          )}
        </div>
        {failed && (
          <label className="copy-fallback">
            <span className="inline-error">Não consegui copiar. Selecione o código abaixo:</span>
            <input readOnly value={failed} onFocus={(event) => event.target.select()} />
          </label>
        )}
        {error && <span className="inline-error">{error}</span>}
      </div>
    </div>
    </>
  );
}
