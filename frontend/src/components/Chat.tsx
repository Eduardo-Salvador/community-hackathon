import { useEffect, useRef } from 'react';
import { useStore } from '../conversation/context';
import type { AssistantItem, ConversationState } from '../conversation/store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CardView } from './cards/CardView';
import { Composer } from './Composer';
import { Header } from './Header';
import { Mist } from './Mist';
import { StepChips } from './StepChips';

type ChatProps = {
  state: ConversationState;
  onMic: () => void;
  onEnd: () => void;
  micDisabled?: boolean;
};

export function Chat({ state, onMic, onEnd, micDisabled }: ChatProps) {
  const store = useStore();
  const endRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const reduced = useReducedMotion();
  const count = state.items.length;
  const last = state.items[count - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: mounted.current && !reduced ? 'smooth' : 'auto' });
    mounted.current = true;
  }, [count, last, reduced]);

  const placeholder = state.offer?.type === 'uf' ? 'Responda ou pergunte outra coisa' : 'Pergunte outra coisa';

  return (
    <div className="chat">
      <Header uf={state.uf} onHome={store.goHome} onEnd={onEnd} />
      <div className="chat__scroll">
        <div className="chat__column" role="log" aria-live="polite" aria-relevant="additions text">
          {state.items.map((item) =>
            item.kind === 'user' ? (
              <div key={item.id} className="bubble">
                {item.text}
              </div>
            ) : (
              <AssistantTurn key={item.id} item={item} />
            ),
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="chat__composer">
        <Composer label="Mensagem" placeholder={placeholder} onSend={store.send} onMic={onMic} disabled={state.busy} micDisabled={micDisabled} />
      </div>
    </div>
  );
}

function AssistantTurn({ item }: { item: AssistantItem }) {
  const store = useStore();
  const thinking = item.busy && !item.text;
  return (
    <div className="turn">
      <Mist variant="avatar" size={40} busy={item.busy} />
      <div className="turn__body">
        <StepChips chips={item.chips} />
        {item.text && <p className="turn__text">{item.text}</p>}
        {thinking && (
          <div className="typing" role="status" aria-label="Pensando">
            <span />
            <span />
            <span />
          </div>
        )}
        {item.card && <CardView turn={item.id} card={item.card} />}
        {item.suggestions && item.suggestions.length > 0 && (
          <div className="turn__suggestions">
            {item.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="try-chip try-chip--suggest"
                onClick={() => store.send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
