import { extensionLinks } from '../../core/extension-links.ts';
import { sleep } from '../../core/errors.ts';
import { defineTool } from '../../tools/types.ts';

export const loginTools = [
  defineTool({
    name: 'iniciar_login',
    service: 'login',
    description:
      'Abre a tela de login do gov.br para o usuário entrar. Necessário antes de consultar CNH, multas ou veículos. ' +
      'O login termina quando o evento login:aguardando_usuario chega como ok. ' +
      'Se a extensão do Chrome estiver conectada, não abre nada: espera o usuário clicar em Sincronizar na extensão.',
    async handler({ session, config, browsers, emit }) {
      // Extensão conectada: o login é no Chrome do usuário. Nada de navegador na nuvem (o captcha do gov.br barra).
      // Com MOCK=1, o login simulado tem prioridade.
      if (!config.mock && extensionLinks.isLinked(session.id)) {
        if (session.extensao) {
          emit('aguardando_usuario', 'ok', { via: 'extensao' });
          return { liveViewUrl: '', loggedIn: true };
        }
        emit('aguardando_usuario', 'start', { via: 'extensao', liveViewUrl: '' });
        const deadline = Date.now() + config.loginTimeoutMs;
        const timer = setInterval(() => {
          if (session.extensao) {
            clearInterval(timer);
            emit('aguardando_usuario', 'ok', { via: 'extensao' });
          } else if (Date.now() > deadline) {
            clearInterval(timer);
            emit('aguardando_usuario', 'error', { code: 'LOGIN_TIMEOUT', via: 'extensao' });
          }
        }, config.loginPollMs);
        timer.unref();
        return { liveViewUrl: '', loggedIn: false };
      }

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
