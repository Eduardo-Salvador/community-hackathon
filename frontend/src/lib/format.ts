const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(value: number): string {
  return currency.format(value).replace(/ /g, ' ');
}

function parts(iso: string) {
  const [year = 0, month = 1, day = 1] = iso.slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

const pad = (value: number) => String(value).padStart(2, '0');

export function dateBR(iso: string): string {
  const { year, month, day } = parts(iso);
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function dayMonth(iso: string): string {
  const { month, day } = parts(iso);
  return `${pad(day)}/${pad(month)}`;
}

export function monthYearLong(iso: string): string {
  const { year, month } = parts(iso);
  return `${MONTHS[month - 1]} de ${year}`;
}

export function monthYearShort(iso: string): string {
  const { year, month } = parts(iso);
  return `${MONTHS[month - 1]?.slice(0, 3)}/${year}`;
}

function daysUntil(iso: string, now: Date): number {
  const { year, month, day } = parts(iso);
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function monthReference(iso: string, now: Date): string {
  const { month } = parts(iso);
  return daysUntil(iso, now) <= 330 ? (MONTHS[month - 1] ?? '') : monthYearLong(iso);
}

export function dayReference(iso: string, now: Date): string {
  const { day } = parts(iso);
  return daysUntil(iso, now) <= 31 ? `dia ${day}` : dayMonth(iso);
}

export function discountPercent(valor: number, comDesconto: number): number {
  return valor > 0 ? Math.round((1 - comDesconto / valor) * 100) : 0;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 2 || /^[A-ZÀ-Ú]/.test(word));
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return last ? `${words[0]} ${last[0]}.` : (words[0] ?? '');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const LOWERCASE_WORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => (index > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}
