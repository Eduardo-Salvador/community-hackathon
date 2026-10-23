import type { Chip } from '../conversation/store';
import { AlertIcon, CheckIcon, ClockIcon } from './icons';

export function StepChips({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="chips" aria-label="Etapas">
      {chips.map((chip) => (
        <li key={chip.key} className={`chip chip--${chip.status}`}>
          {chip.status === 'ok' ? <CheckIcon /> : chip.status === 'error' ? <AlertIcon /> : <ClockIcon />}
          {chip.label}
        </li>
      ))}
    </ul>
  );
}
