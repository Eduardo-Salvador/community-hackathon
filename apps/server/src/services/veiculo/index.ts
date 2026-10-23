import { defineTool } from '../../tools/types.ts';
import { consultarVeiculos } from './consultar.ts';

export const veiculoTools = [
  defineTool({
    name: 'consultar_veiculos',
    service: 'veiculo',
    description: 'Lista os veículos do usuário com licenciamento, IPVA, restrições e recall. Só leitura.',
    async handler(ctx) {
      return consultarVeiculos(ctx);
    },
  }),
];
