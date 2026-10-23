import { BrazilFlag } from './icons';

type HeaderProps = {
  uf?: string;
  onHome?: () => void;
  onEnd?: () => void;
};

export function Header({ uf, onHome, onEnd }: HeaderProps) {
  return (
    <header className="topbar">
      <button type="button" className="topbar__home" onClick={onHome} aria-label="Início" disabled={!onHome}>
        <BrazilFlag />
      </button>
      {uf && <span className="topbar__uf">DETRAN · {uf}</span>}
      {onEnd && (
        <button type="button" className="ghost-button" onClick={onEnd}>
          Encerrar e apagar dados
        </button>
      )}
    </header>
  );
}
