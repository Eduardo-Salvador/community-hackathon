import { z } from 'zod';
import { VeiculoSchema, type Veiculo } from '@hackathon/contracts';
import type { Page } from 'playwright-core';
import { AdapterError } from '../../adapters/http/errors.ts';
import type { Extractor } from '../../ai/extract.ts';
import { pageText } from '../../browser/portal.ts';
import { ToolError } from '../../core/errors.ts';
import { fromPortal, UntrustedDataError } from '../../core/untrusted.ts';

const VeiculoPortalSchema = VeiculoSchema.omit({ crlvFileId: true });
const ResultadoPortalSchema = z.object({ veiculos: z.array(VeiculoPortalSchema) });

type VeiculoPortal = Omit<Veiculo, 'crlvFileId'>;

// Texto da tela "Meus Veículos" → veículos validados. Usado pelo navegador remoto e pela extensão.
export async function veiculosDoTexto(extractor: Extractor, texto: string): Promise<VeiculoPortal[]> {
  const extraido = await extractor.extract('veiculos_portal', ResultadoPortalSchema, texto);
  return fromPortal('portal-senatran:veiculos', ResultadoPortalSchema, extraido).veiculos;
}

export async function consultarVeiculosNoPortal(
  page: Page,
  extractor: Extractor,
  url?: string,
): Promise<VeiculoPortal[]> {
  try {
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
    const extraido = await extractor.extract('veiculos_portal', ResultadoPortalSchema, await pageText(page));
    return fromPortal('portal-senatran:veiculos', ResultadoPortalSchema, extraido).veiculos;
  } catch (error) {
    if (error instanceof AdapterError || error instanceof ToolError || error instanceof UntrustedDataError) throw error;
    throw new AdapterError('Portal Senatran', 'NETWORK', 'Falha ao consultar veículos no portal', {
      retryable: true,
    });
  }
}
