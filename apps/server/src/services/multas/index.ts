import { sleep, ToolError } from '../../core/errors.ts';
import { guiaShareText, pixQrCode } from '../../core/share.ts';
import { defineTool } from '../../tools/types.ts';

// Stub do Dev B (S2). Mantém o contrato para o frontend e a voz já funcionarem em mock.
const MOCK_MULTAS = [
  {
    id: 'm1',
    descricao: 'Avançar sinal vermelho',
    data: '2026-03-10',
    local: 'Av. Paulista, São Paulo',
    gravidade: 'gravissima' as const,
    pontos: 7,
    valor: 293.47,
    valorComDesconto: 176.08,
    prazoDesconto: '2026-11-10',
    expiraContagemEm: '2027-03-10',
  },
  {
    id: 'm2',
    descricao: 'Velocidade até 20% acima',
    data: '2026-06-02',
    local: 'Marginal Tietê, São Paulo',
    gravidade: 'media' as const,
    pontos: 4,
    valor: 130.16,
    expiraContagemEm: '2027-06-02',
  },
];

export const multasTools = [
  defineTool({
    name: 'listar_multas',
    service: 'multas',
    description: 'Lista as multas do usuário com pontos, valores, desconto SNE e resumo de pontuação.',
    async handler({ session, config }) {
      if (!session.browser?.loggedIn) throw new ToolError('LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
      if (!config.mock) throw new ToolError('NOT_IMPLEMENTED', 'S2 ainda não implementado (Dev B)');
      await sleep(200);
      const pontos = { total: 11, limite: 30 as const, alerta: 'verde' as const };
      session.profile.multas = MOCK_MULTAS;
      session.profile.pontos = pontos;
      return { multas: MOCK_MULTAS, pontos };
    },
  }),
  defineTool({
    name: 'gerar_guia_multa',
    service: 'multas',
    description: 'Gera boleto/Pix de uma multa. Só chamar depois de o usuário confirmar.',
    async handler({ session, config }, { multaId }) {
      if (!config.mock) throw new ToolError('NOT_IMPLEMENTED', 'S2 ainda não implementado (Dev B)');
      const multa = session.profile.multas?.find((m) => m.id === multaId);
      if (!multa) throw new ToolError('NOT_FOUND', 'Multa não encontrada; liste as multas antes');
      await sleep(200);
      const pixCopiaECola = '00020126580014br.gov.bcb.pix0136mock-chave-pix-detran5204000053039865802BR6304ABCD';
      return {
        multaId,
        pixCopiaECola,
        pixQrCode: await pixQrCode(pixCopiaECola),
        textoCompartilhar: guiaShareText({
          descricao: multa.descricao,
          valor: multa.valorComDesconto ?? multa.valor,
          vencimento: multa.prazoDesconto,
          pixCopiaECola,
        }),
      };
    },
  }),
];
