import { useEffect, useId, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { ChatBubbleIcon, LinkIcon, MailIcon, ShareIcon } from './icons';

export type ShareTarget = { whatsappUrl: string; emailUrl: string; copy: string };

type ShareMenuProps = {
  load: () => Promise<ShareTarget>;
  nativeShare?: () => Promise<void>;
  copyLabel: string;
  copiedLabel: string;
  note?: string;
  small?: boolean;
  onError: (message?: string) => void;
};

export function prefersNativeShare(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches
  );
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function emailUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function safe(target: ShareTarget): ShareTarget {
  return {
    whatsappUrl: target.whatsappUrl.startsWith('https://wa.me/') ? target.whatsappUrl : whatsappUrl(target.copy),
    emailUrl: target.emailUrl.startsWith('mailto:') ? target.emailUrl : emailUrl('', target.copy),
    copy: target.copy,
  };
}

export function ShareMenu({ load, nativeShare, copyLabel, copiedLabel, note, small, onError }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ShareTarget>();
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = async () => {
    onError(undefined);
    if (nativeShare && prefersNativeShare()) {
      try {
        await nativeShare();
      } catch (error) {
        if ((error as DOMException)?.name !== 'AbortError') onError('Não consegui compartilhar agora.');
      }
      return;
    }
    if (open) return setOpen(false);
    setOpen(true);
    setCopied(false);
    try {
      setTarget(safe(await load()));
    } catch {
      setOpen(false);
      onError('Não consegui preparar o compartilhamento. Tente de novo.');
    }
  };

  const copy = async () => {
    if (!target) return;
    if (await copyText(target.copy)) setCopied(true);
    else onError('Não consegui copiar.');
  };

  return (
    <div className="share" ref={rootRef}>
      <button
        type="button"
        className={small ? 'btn btn--xs' : 'btn'}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        <ShareIcon size={small ? 16 : 18} />
        Compartilhar
      </button>
      {open && (
        <div id={menuId} role="menu" className="share__menu" aria-busy={!target}>
          <a
            role="menuitem"
            className="share__item"
            href={target?.whatsappUrl}
            aria-disabled={!target}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <span className="share__icon" style={{ background: '#25D366' }}>
              <ChatBubbleIcon color="#FFFFFF" />
            </span>
            WhatsApp
          </a>
          <a role="menuitem" className="share__item" href={target?.emailUrl} aria-disabled={!target} onClick={() => setOpen(false)}>
            <span className="share__icon">
              <MailIcon />
            </span>
            E-mail
          </a>
          <button type="button" role="menuitem" className="share__item" onClick={copy} disabled={!target}>
            <span className="share__icon">
              <LinkIcon />
            </span>
            {copied ? copiedLabel : copyLabel}
          </button>
          <span className="share__note">{target ? note : 'Preparando…'}</span>
        </div>
      )}
    </div>
  );
}
