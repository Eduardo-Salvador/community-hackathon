import { sleep, ToolError } from '../../core/errors.ts';
import { defineTool } from '../../tools/types.ts';
import { listarMultas } from './listar.ts';

export const multasTools = [
  defineTool({
    name: 'listar_multas',
    service: 'multas',
    description: 'Lista as multas do usuário com pontos, valores, desconto SNE e resumo de pontuação.',
    async handler(ctx) {
      return listarMultas(ctx);
    },
  }),
  defineTool({
    name: 'gerar_guia_multa',
    service: 'multas',
    description: 'Gera boleto/Pix de uma multa. Só chamar depois de o usuário confirmar.',
    async handler({ session, config }, { multaId }) {
      if (!config.mock) throw new ToolError('NOT_IMPLEMENTED', 'S2 ainda não implementado (Dev B)');
      if (!session.profile.multas?.some((m) => m.id === multaId)) {
        throw new ToolError('NOT_FOUND', 'Multa não encontrada; liste as multas antes');
      }
      await sleep(200);
      return { multaId, pixCopiaECola: '00020126MOCKPIX' };
    },
  }),
];
