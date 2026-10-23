import { defineTool } from '../../tools/types.ts';

// A UF define a Sefaz do IPVA e o DETRAN estadual; CNH, multas e veículo vêm da Senatran.
export const ufTools = [
  defineTool({
    name: 'selecionar_uf',
    service: 'uf',
    description: 'Define o estado (UF) do usuário. Deve ser a primeira etapa da conversa.',
    async handler({ session }, { uf }) {
      session.uf = uf;
      return { uf };
    },
  }),
];
