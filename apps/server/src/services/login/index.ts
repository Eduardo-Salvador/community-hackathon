import { sleep, ToolError } from '../../core/errors.ts';
import { defineTool } from '../../tools/types.ts';

export const loginTools = [
  defineTool({
    name: 'iniciar_login',
    service: 'login',
    description:
      'Abre a tela de login do gov.br para o usuário entrar. Necessário antes de consultar CNH, multas ou veículos.',
    async handler({ session, config, emit }) {
      if (!session.uf) throw new ToolError('UF_REQUIRED', 'Selecione o estado antes de fazer login');
      if (!config.mock) throw new ToolError('NOT_IMPLEMENTED', 'Login real (Browserbase) ainda não implementado');

      // TODO(A5): criar sessão Browserbase, devolver liveViewUrl e detectar o fim do login.
      const browser = { sessionId: 'mock-browser', liveViewUrl: 'about:blank', loggedIn: false };
      session.browser = browser;
      emit('aguardando_usuario', 'start', { liveViewUrl: browser.liveViewUrl });
      await sleep(300);
      browser.loggedIn = true;
      emit('aguardando_usuario', 'ok');
      return { liveViewUrl: browser.liveViewUrl, loggedIn: true };
    },
  }),
];
