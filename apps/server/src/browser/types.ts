import type { Page } from 'playwright-core';

// Navegador remoto aberto para uma sessão do usuário.
export type RemoteBrowser = {
  id: string;
  liveViewUrl: string;
  page: Page;
  close: () => Promise<void>;
};

// Abstração para trocar Browserbase por um fake nos testes.
export interface BrowserProvider {
  open(): Promise<RemoteBrowser>;
}
