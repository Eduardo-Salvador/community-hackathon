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
    description:
      'Gera a guia oficial (boleto/Pix do SNE, com desconto quando houver) de uma multa no portal da Senatran. ' +
      'Exige login gov.br. Só chamar depois de o usuário confirmar. Se vier demonstracao=true, avise que não é para pagar.',
    async handler(ctx, { multaId }) {
      return gerarGuiaMulta(ctx, multaId);
    },
  }),
];
