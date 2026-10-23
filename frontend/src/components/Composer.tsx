import { useState, type FormEvent } from 'react';
import { ArrowIcon, MicIcon } from './icons';

type ComposerProps = {
  placeholder: string;
  label: string;
  onSend: (text: string) => void;
  onMic: () => void;
  large?: boolean;
  disabled?: boolean;
  micDisabled?: boolean;
};

export function Composer({ placeholder, label, onSend, onMic, large, disabled, micDisabled }: ComposerProps) {
  const [text, setText] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <form className={`composer${large ? ' composer--lg' : ''}`} onSubmit={submit}>
      <label className="composer__label">
        <span className="sr-only">{label}</span>
        <input
          className="composer__input"
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          enterKeyHint="send"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        className="composer__icon"
        aria-label={micDisabled ? 'Voz indisponível no momento' : 'Falar'}
        title={micDisabled ? 'Voz indisponível no momento' : undefined}
        onClick={onMic}
        disabled={micDisabled}
      >
        <MicIcon color="#0F1A15" />
      </button>
      <button type="submit" className="composer__send" aria-label="Enviar" disabled={disabled}>
        <ArrowIcon color="#FFFFFF" size={large ? 22 : 20} />
      </button>
    </form>
  );
}
