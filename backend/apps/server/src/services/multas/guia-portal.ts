import { z } from 'zod';
import type { Multa } from '@hackathon/contracts';
import type { Page } from 'playwright-core';
import type { Extractor } from '../../ai/extract.ts';
import { fetchFile, findDownloadLink, openSection, pageText } from '../../browser/portal.ts';
import { ToolError } from '../../core/errors.ts';

// Textos da tela de pagamento do portal (card "Pague suas multas com até 40% de desconto"). Confirmar no portal real.
const PAGAR = /pagar|emitir|gerar (a )?(guia|boleto)|boleto|pix|com desconto/i;
const BAIXAR_GUIA = /baixar|imprimir|pdf|boleto/i;

const GuiaPortalSchema = z.object({
  encontrado: z.boolean(),
  linhaDigitavel: z.string().optional(),
  pixCopiaECola: z.string().optional(),
});

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type GuiaDoPortal = { linhaDigitavel?: string; pixCopiaECola?: string; pdf?: Buffer };

// Guia oficial (boleto/Pix do SNE) gerada no próprio Portal Senatran, com a sessão gov.br do usuário.
export async function gerarGuiaNoPortal(
  page: Page,
  extractor: Extractor,
  multa: Multa,
  multasUrl: string,
): Promise<GuiaDoPortal> {
  await page.goto(multasUrl, { waitUntil: 'domcontentloaded' });
  // Abre a multa pela descrição, se a lista tiver um link para ela; senão segue na própria tela.
  await openSection(page, new RegExp(escapeRegex(multa.descricao.slice(0, 40)), 'i')).catch(() => {});
  await openSection(page, PAGAR);

  const extraido = await extractor.extract('guia_portal', GuiaPortalSchema, await pageText(page));
  const linha = extraido.linhaDigitavel?.replace(/[^\d. ]/g, ' ').replace(/\s+/g, ' ').trim();
  const linhaDigitavel = linha && /^[\d .]{40,60}$/.test(linha) ? linha : undefined;
  const pixCopiaECola = extraido.pixCopiaECola?.trim() || undefined;
  if (!extraido.encontrado || (!linhaDigitavel && !pixCopiaECola)) {
    throw new ToolError('NOT_FOUND', 'Não encontrei a guia de pagamento desta multa no portal');
  }

  let pdf: Buffer | undefined;
  const href = await findDownloadLink(page, BAIXAR_GUIA);
  if (href) {
    const file = await fetchFile(page, href).catch(() => undefined);
    if (file?.contentType.includes('pdf')) pdf = file.body;
  }
  return { linhaDigitavel, pixCopiaECola, pdf };
}
