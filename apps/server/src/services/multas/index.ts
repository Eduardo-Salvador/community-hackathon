import { defineTool } from '../../tools/types.ts';
import { gerarGuiaMulta } from './gerar-guia.ts';
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
    async handler(ctx, { multaId }) {
      return gerarGuiaMulta(ctx, multaId);
    },
  }),
];
