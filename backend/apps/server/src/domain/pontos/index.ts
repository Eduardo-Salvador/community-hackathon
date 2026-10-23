import type { Gravidade, Multa, ResumoPontos } from '@hackathon/contracts';

export const PONTOS_POR_GRAVIDADE = {
  leve: 3,
  media: 4,
  grave: 5,
  gravissima: 7,
} as const satisfies Record<Gravidade, number>;

export type MultaParaCalculo = Omit<Multa, 'pontos' | 'expiraContagemEm'>;

export type ResultadoPontos = {
  multas: Multa[];
  pontos: ResumoPontos;
};

type DataIso = {
  ano: number;
  mes: number;
  dia: number;
};

const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function lerDataIso(valor: string): DataIso {
  const partes = FORMATO_DATA.exec(valor);
  if (!partes) throw new TypeError(`Data inválida: ${valor}`);

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new TypeError(`Data inválida: ${valor}`);
  }

  return { ano, mes, dia };
}

function formatarData({ ano, mes, dia }: DataIso): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function adicionarDozeMeses(valor: string): string {
  const { ano, mes, dia } = lerDataIso(valor);
  const anoDestino = ano + 1;
  const ultimoDiaDoMes = new Date(Date.UTC(anoDestino, mes, 0)).getUTCDate();
  return formatarData({ ano: anoDestino, mes, dia: Math.min(dia, ultimoDiaDoMes) });
}

function dataAtualNoBrasil(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

function calcularLimite(multasAtivas: Multa[], ear: boolean): ResumoPontos['limite'] {
  if (ear) return 40;
  const gravissimas = multasAtivas.filter((multa) => multa.gravidade === 'gravissima').length;
  if (gravissimas >= 2) return 20;
  if (gravissimas === 1) return 30;
  return 40;
}

function calcularAlerta(total: number, limite: ResumoPontos['limite']): ResumoPontos['alerta'] {
  const percentual = total / limite;
  if (percentual < 0.5) return 'verde';
  if (percentual <= 0.8) return 'amarelo';
  return 'vermelho';
}

export function calcularPontos(
  multasSemCalculo: MultaParaCalculo[],
  ear: boolean,
  dataReferencia = dataAtualNoBrasil(),
): ResultadoPontos {
  lerDataIso(dataReferencia);

  const multas = multasSemCalculo.map((multa): Multa => {
    lerDataIso(multa.data);
    if (multa.data > dataReferencia) {
      throw new RangeError(`Data da multa ${multa.id} está no futuro`);
    }

    return {
      ...multa,
      pontos: PONTOS_POR_GRAVIDADE[multa.gravidade],
      expiraContagemEm: adicionarDozeMeses(multa.data),
    };
  });

  // No dia indicado por expiraContagemEm a multa já completou doze meses.
  const multasAtivas = multas.filter((multa) => multa.expiraContagemEm > dataReferencia);
  const total = multasAtivas.reduce((soma, multa) => soma + multa.pontos, 0);
  const limite = calcularLimite(multasAtivas, ear);

  return {
    multas,
    pontos: { total, limite, alerta: calcularAlerta(total, limite) },
  };
}
