import { defineTool } from '../../tools/types.ts';
import { gerarGuiaMulta } from './gerar-guia.ts';
import { listarMultas } from './listar.ts';

export const multasTools = [
  defineTool({
    name: 'listar_multas',
    service: 'multas',
    description:
      'Lista multas, pontos e desconto SNE. Sem portal, aceita CPF ou placa com RENAVAM para fallback por API.',
    async handler(ctx, input) {
      return listarMultas(ctx, input);
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
