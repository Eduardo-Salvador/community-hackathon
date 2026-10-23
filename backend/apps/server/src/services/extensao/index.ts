import type { StepEvent } from '@hackathon/contracts';
import type { Extractor } from '../../ai/extract.ts';
import { extensionLinks } from '../../core/extension-links.ts';
import type { Session } from '../../core/session-store.ts';
import { defineTool } from '../../tools/types.ts';
import { cnhDoTexto } from '../cnh/index.ts';
import { multasDoTexto } from '../multas/portal.ts';
import { veiculosDoTexto } from '../veiculo/portal.ts';

type Emit = (step: string, status: StepEvent['status'], data?: unknown) => void;

export type TipoPagina = 'cnh' | 'multas' | 'veiculos';

// Qual tela do portal a extensão mandou, pela rota (catálogo oficial do portal da Senatran).
export function tipoDaPagina(url: string, portalUrl: string): TipoPagina | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'https:' || u.hostname !== new URL(portalUrl).hostname) return undefined;
  if (u.hash.startsWith('#/habilitacao')) return 'cnh';
  if (u.hash.startsWith('#/infracoes')) return 'multas';
  if (u.hash.startsWith('#/veiculos')) return 'veiculos';
  return undefined;
}

// Recebe o texto de uma tela do portal, lida no Chrome do próprio usuário, e guarda os dados na sessão.
export async function ingerirPagina(
  session: Session,
  extractor: Extractor,
  emit: Emit,
  tipo: TipoPagina,
  texto: string,
): Promise<{ tipo: TipoPagina; quantidade: number }> {
  emit('recebendo_da_extensao', 'start', { tipo });
  const extensao = (session.extensao ??= {});
  let quantidade = 1;
  if (tipo === 'cnh') extensao.cnh = await cnhDoTexto(extractor, texto);
  if (tipo === 'multas') {
    extensao.multas = await multasDoTexto(extractor, texto);
    quantidade = extensao.multas.multas.length;
  }
  if (tipo === 'veiculos') {
    extensao.veiculos = await veiculosDoTexto(extractor, texto);
    quantidade = extensao.veiculos.length;
  }
  extensao.sincronizadoEm = new Date().toISOString();
  // O usuário está logado no gov.br no navegador dele: libera as consultas sem navegador remoto.
  session.browser = { sessionId: 'extensao', liveViewUrl: '', loggedIn: true };
  emit('recebendo_da_extensao', 'ok', { tipo, quantidade });
  return { tipo, quantidade };
}

export const extensaoTools = [
    defineTool({
      name: 'conectar_extensao',
      service: 'login',
      description:
        'Gera um código de 6 letras para ligar a extensão Tupi Brasil do Chrome a esta conversa. ' +
        'Use quando o usuário preferir entrar no gov.br pelo próprio navegador. Fale o código e peça para digitar na extensão.',
      async handler({ session }) {
        const { codigo, expiraEm } = extensionLinks.createCode(session.id);
        return {
          codigo,
          expiraEm,
          instrucoes:
            'Abra a extensão Tupi Brasil no Chrome, digite o código, entre no gov.br no seu navegador e clique em Sincronizar.',
        };
      },
    }),
];
