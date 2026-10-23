import { z } from 'zod';
import { MultaSchema } from '@hackathon/contracts';
import type { Page } from 'playwright-core';
import { AdapterError } from '../../adapters/http/errors.ts';
import type { Extractor } from '../../ai/extract.ts';
import { pageText } from '../../browser/portal.ts';
import { ToolError } from '../../core/errors.ts';
import { fromPortal, UntrustedDataError } from '../../core/untrusted.ts';
import type { MultaParaCalculo } from '../../domain/pontos/index.ts';

const MultaPortalSchema = MultaSchema.omit({ pontos: true, expiraContagemEm: true });
const ResultadoPortalSchema = z.object({
  ear: z.boolean(),
  multas: z.array(MultaPortalSchema),
});

export type ResultadoPortalMultas = {
  ear: boolean;
  multas: MultaParaCalculo[];
};

export async function consultarMultasNoPortal(
  page: Page,
  extractor: Extractor,
  url?: string,
): Promise<ResultadoPortalMultas> {
  try {
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
    const extraido = await extractor.extract('multas_portal', ResultadoPortalSchema, await pageText(page));
    return fromPortal('portal-senatran:multas', ResultadoPortalSchema, extraido);
  } catch (error) {
    if (error instanceof AdapterError || error instanceof ToolError || error instanceof UntrustedDataError) throw error;
    throw new AdapterError('Portal Senatran', 'NETWORK', 'Falha ao consultar multas no portal', {
      retryable: true,
    });
  }
}
