import { useEffect } from 'react';
import { useStore } from '../../conversation/context';
import type { Card } from '../../conversation/store';
import { CheckIcon, LockIcon } from '../icons';

type LoginCardProps = { turn: string; card: Extract<Card, { type: 'login' }> };

const MOCK_LIVE_VIEW = 'about:blank';
const MOCK_LOGIN_DELAY = 4000;

export function LoginCard({ turn, card }: LoginCardProps) {
  const store = useStore();
  const mock = card.liveViewUrl === MOCK_LIVE_VIEW;

  useEffect(() => {
    if (!mock || card.status !== 'waiting') return;
    const timer = setTimeout(() => void store.simulateLogin(), MOCK_LOGIN_DELAY);
    return () => clearTimeout(timer);
  }, [mock, card.status, store]);

  if (card.status === 'done') {
    return (
      <div className="login__done">
        <CheckIcon size={16} />
        Login concluído no gov.br
      </div>
    );
  }
  if (card.status === 'expired') {
    return (
      <button type="button" className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={() => store.retryLogin(turn)}>
        Tentar de novo
      </button>
    );
  }
  const live = card.liveViewUrl && !mock && /^https:\/\//.test(card.liveViewUrl);
  return (
    <div className="login">
        <div className="login__bar">
          <LockIcon />
          <span>Janela segura · sso.acesso.gov.br</span>
        </div>
        {live ? (
          <iframe
            className="login__frame"
            src={card.liveViewUrl}
            title="Login do gov.br"
            sandbox="allow-same-origin allow-scripts allow-forms"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="login__view">
            <strong>{card.liveViewUrl ? 'Login do gov.br ao vivo' : 'Abrindo o gov.br…'}</strong>
            <span>CPF, senha e verificação em duas etapas são digitados aqui, direto no gov.br.</span>
          </div>
        )}
    </div>
  );
}
