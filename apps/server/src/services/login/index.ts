import { sleep } from '../../core/errors.ts';
import { defineTool } from '../../tools/types.ts';

export const loginTools = [
  defineTool({
    name: 'iniciar_login',
    service: 'login',
    description:
      'Abre a tela de login do gov.br para o usuário entrar. Necessário antes de consultar CNH, multas ou veículos. ' +
      'O login termina quando o evento login:aguardando_usuario chega como ok.',
    async handler({ session, config, browsers, emit }) {
      if (!config.mock) return browsers.startLogin(session, emit);

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
