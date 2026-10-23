type DadosGuiaPdf = {
  multaId: string;
  descricao: string;
  valorCentavos: number;
  descontoSneAplicado: boolean;
  pixCopiaECola?: string;
  linhaDigitavel?: string;
};

function textoPdf(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

function quebrar(valor: string, tamanho = 72): string[] {
  return valor.match(new RegExp(`.{1,${tamanho}}`, 'g')) ?? [];
}

// PDF pequeno e autocontido para que a guia nunca dependa de uma URL externa.
export function criarPdfGuia(dados: DadosGuiaPdf): Buffer {
  const valor = (dados.valorCentavos / 100).toFixed(2).replace('.', ',');
  const linhas = [
    'Guia de pagamento de multa',
    `Multa: ${dados.multaId}`,
    `Descricao: ${dados.descricao}`,
    `Valor: R$ ${valor}`,
    `Desconto SNE aplicado: ${dados.descontoSneAplicado ? 'sim' : 'nao'}`,
    ...(dados.linhaDigitavel ? ['Linha digitavel:', ...quebrar(dados.linhaDigitavel)] : []),
    ...(dados.pixCopiaECola ? ['Pix copia e cola:', ...quebrar(dados.pixCopiaECola)] : []),
  ].map(textoPdf);
  const comandos = ['BT', '/F1 11 Tf', '40 790 Td', '14 TL'];
  for (const [indice, linha] of linhas.entries()) {
    comandos.push(`${indice === 0 ? '' : 'T* '}(${linha}) Tj`);
  }
  comandos.push('ET');
  const stream = comandos.join('\n');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let conteudo = '%PDF-1.4\n';
  const offsets = [0];
  for (const [indice, objeto] of objetos.entries()) {
    offsets.push(Buffer.byteLength(conteudo));
    conteudo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  }
  const xref = Buffer.byteLength(conteudo);
  conteudo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  conteudo += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  conteudo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(conteudo, 'ascii');
}
