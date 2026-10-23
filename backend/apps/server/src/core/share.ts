import QRCode from 'qrcode';

// Espaço normal em vez do não separável que o Intl usa, para não quebrar em apps de mensagem.
const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
const brDate = (iso: string) => iso.split('-').reverse().join('/');
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function shareLinks(text: string, subject: string) {
  return {
    texto: text,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
    emailUrl: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
  };
}

export function fileShareText(title: string, url: string, expiresAt: number) {
  return `${title}\n${url}\n(link válido até ${time(expiresAt)})`;
}

// Texto pronto da guia para WhatsApp/e-mail: o código (Pix ou boleto) vai no fim para facilitar copiar.
// Serve para multa ou qualquer taxa (ex.: CNH), paga por Pix ou por boleto.
export function guiaShareText(g: {
  rotulo?: string;
  descricao: string;
  valor: number;
  vencimento?: string;
  linhaDigitavel?: string;
  pixCopiaECola?: string;
}) {
  const lines = [`${g.rotulo ?? 'Multa'}: ${g.descricao}`, `Valor: ${brl(g.valor)}`];
  if (g.vencimento) lines.push(`Vencimento: ${brDate(g.vencimento)}`);
  if (g.linhaDigitavel) lines.push(`Boleto: ${g.linhaDigitavel}`);
  if (g.pixCopiaECola) lines.push('Pix copia e cola:', g.pixCopiaECola);
  return lines.join('\n');
}

// QR Code do Pix como data URL (PNG) para o frontend mostrar direto num <img>.
export function pixQrCode(pixCopiaECola: string): Promise<string> {
  return QRCode.toDataURL(pixCopiaECola, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
}
