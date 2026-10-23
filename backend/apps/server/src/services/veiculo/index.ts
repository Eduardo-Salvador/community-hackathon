import { defineTool } from '../../tools/types.ts';
import { consultarVeiculos } from './consultar.ts';

export const veiculoTools = [
  defineTool({
    name: 'consultar_veiculos',
    service: 'veiculo',
    description:
      'Lista veículos, licenciamento, IPVA, restrições e recall. Sem portal, aceita CPF ou placa com RENAVAM.',
    async handler(ctx, input) {
      return consultarVeiculos(ctx, input);
    },
  }),
];
