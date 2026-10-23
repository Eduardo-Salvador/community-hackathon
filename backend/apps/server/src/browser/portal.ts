import type { Page } from 'playwright-core';
import { ToolError } from '../core/errors.ts';

type Clickable = { index: number; text: string; href: string | null };

// Só baixamos arquivos de domínios gov.br: o pedido sai do nosso servidor, então um link
// apontando para outro lugar (ex.: rede interna) nunca pode ser seguido.
export function isAllowedDownload(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && (url.hostname === 'gov.br' || url.hostname.endsWith('.gov.br'));
  } catch {
    return false;
  }
}

async function clickables(page: Page): Promise<Clickable[]> {
  return page.locator('a, button').evaluateAll((els) =>
    els.map((el, index) => ({
      index,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      href: el instanceof HTMLAnchorElement ? el.href : null,
    })),
  );
}

// Abre a seção do portal clicando no primeiro link/botão cujo texto bate com o padrão.
export async function openSection(page: Page, pattern: RegExp): Promise<void> {
  const target = (await clickables(page)).find((c) => pattern.test(c.text));
  if (!target) throw new ToolError('NOT_FOUND', 'Não encontrei essa seção no portal');
  await page.locator('a, button').nth(target.index).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function pageText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

export async function findDownloadLink(page: Page, pattern: RegExp): Promise<string | undefined> {
  return (await clickables(page)).find((c) => c.href && pattern.test(c.text) && isAllowedDownload(c.href))?.href ?? undefined;
}

// Baixa usando os cookies da sessão logada do navegador.
export async function fetchFile(page: Page, href: string): Promise<{ body: Buffer; contentType: string }> {
  if (!isAllowedDownload(href)) throw new ToolError('NOT_FOUND', 'Link de download fora do gov.br');
  const res = await page.context().request.get(href, { maxRedirects: 3, timeout: 30_000 });
  if (!isAllowedDownload(res.url())) throw new ToolError('NOT_FOUND', 'Download redirecionou para fora do gov.br');
  if (!res.ok()) throw new ToolError('NOT_FOUND', `Download falhou (${res.status()})`);
  return { body: await res.body(), contentType: res.headers()['content-type'] ?? '' };
}

export async function screenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ fullPage: true, type: 'png' });
}
