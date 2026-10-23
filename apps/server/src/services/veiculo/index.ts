import { sleep, ToolError } from '../../core/errors.ts';
import { defineTool } from '../../tools/types.ts';

// Stub do Dev B (S3). IPVA vem da Sefaz da UF; o resto vem da Senatran.
export const veiculoTools = [
  defineTool({
    name: 'consultar_veiculos',
    service: 'veiculo',
    description: 'Lista os veículos do usuário com licenciamento, IPVA, restrições e recall. Só leitura.',
    async handler({ session, config }) {
      if (!session.browser?.loggedIn) throw new ToolError('LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
      if (!config.mock) throw new ToolError('NOT_IMPLEMENTED', 'S3 ainda não implementado (Dev B)');
      await sleep(200);
      const veiculos = [
        {
          placa: 'ABC1D23',
          modelo: 'VW GOL 1.0',
          licenciamento: { pago: false, vencimento: '2026-10-31' },
          ipvaEmAberto: 0,
          restricoes: [],
          recall: [],
        },
      ];
      session.profile.veiculos = veiculos;
      return { veiculos };
    },
  }),
];
