import type { Page } from 'playwright-core';

// Navegador remoto aberto para uma sessão do usuário.
export type RemoteBrowser = {
  id: string;
  liveViewUrl: string;
  page: Page;
  close: () => Promise<void>;
  // Opcional (sessão keepAlive): solta o controle do navegador durante o login, para o gov.br
  // não detectar automação, e retoma depois. currentUrl lê a URL sem conectar no navegador.
  detach?: () => Promise<void>;
  attach?: () => Promise<Page>;
  currentUrl?: () => Promise<string>;
};

// Abstração para trocar Browserbase por um fake nos testes.
export interface BrowserProvider {
  open(): Promise<RemoteBrowser>;
}
