import type { Veiculo } from '@hackathon/contracts';
import { sleep, ToolError } from '../../core/errors.ts';
import { defineTool, type ToolContext } from '../../tools/types.ts';

// Consultas da Infosimples que NÃO pedem senha gov.br (recall e exame toxicológico).

const limpar = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
// Data fora do formato esperado é descartada em vez de quebrar o contrato.
const brParaIso = (s?: string) => {
  const iso = s?.replace(/^(\d{2})\/(\d{2})\/(\d{4}).*$/, '$3-$2-$1');
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
};
const isoParaBr = (s: string) => s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');

function textoRecall(item: unknown): string | undefined {
  if (typeof item === 'string') return limpar(item) || undefined;
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const v = [o.descricao, o.titulo, o.campanha, o.defeito, o.nome].find((x) => typeof x === 'string');
    return v ? limpar(v as string) : undefined;
  }
  return undefined;
}

// Preenche "recall" dos veículos. Falha aqui nunca derruba a consulta de veículos.
export async function enriquecerRecall(ctx: ToolContext, veiculos: Veiculo[]): Promise<Veiculo[]> {
  if (ctx.config.mock || !ctx.config.infosimplesToken) return veiculos;
  ctx.emit('consultando_recall', 'start');
  const result = await Promise.all(
    veiculos.map(async (v) => {
      try {
        const data = await ctx.adapters.infosimples.consultarServico('senatran/recall', { placa: v.placa });
        const lista = data.flatMap((d) => ((d as Record<string, unknown>)?.recalls_pendentes as unknown[]) ?? []);
        const recall = lista.map(textoRecall).filter((x): x is string => Boolean(x));
        return { ...v, recall: recall.length ? recall : v.recall };
      } catch {
        return v;
      }
    }),
  );
  ctx.emit('consultando_recall', 'ok');
  return result;
}

export const extrasTools = [
  defineTool({
    name: 'consultar_toxicologico',
    service: 'cnh',
    description:
      'Consulta o prazo do exame toxicológico (CNH categorias C, D ou E). Precisa do CPF e da data de nascimento; ' +
      'usa a validade da CNH já consultada ou a informada.',
    async handler(ctx, { cpf, dataNascimento, validadeCnh }) {
      const validade = validadeCnh ?? ctx.session.profile.cnh?.validade;
      if (ctx.config.mock) {
        await sleep(200);
        return { dataColeta: '2025-04-10', prazoNovoExame: '2027-10-10', observacao: 'Exame em dia' };
      }
      if (!validade) throw new ToolError('NOT_FOUND', 'Informe a validade da CNH ou consulte a CNH antes');
      ctx.emit('consultando_toxicologico', 'start');
      const data = await ctx.adapters.infosimples.consultarServico('senatran/exame-toxicologico', {
        cpf: cpf.replace(/\D/g, ''),
        birthdate: isoParaBr(dataNascimento),
        data_vencimento_cnh: isoParaBr(validade),
      });
      ctx.emit('consultando_toxicologico', 'ok');
      const o = (data[0] ?? {}) as Record<string, unknown>;
      const str = (x: unknown) => (typeof x === 'string' && x.trim() ? limpar(x) : undefined);
      return {
        dataColeta: brParaIso(str(o.data_coleta_amostra)),
        prazoNovoExame: brParaIso(str(o.prazo_novo_exame)),
        observacao: str(o.observacao),
      };
    },
  }),
];
