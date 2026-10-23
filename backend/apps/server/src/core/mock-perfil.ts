import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { CnhSchema, MultaSchema, VeiculoSchema } from '@hackathon/contracts';

// Dados de demonstração vindos da variável MOCK_PERFIL (JSON) no painel da hospedagem.
// Ficam fora do repositório (que é público). Qualquer parte ausente usa o exemplo padrão.
const MockPerfilSchema = z.object({
  cnh: CnhSchema.omit({ pdfFileId: true }).optional(),
  multas: z.array(MultaSchema.omit({ pontos: true, expiraContagemEm: true })).optional(),
  veiculos: z.array(VeiculoSchema.omit({ crlvFileId: true })).optional(),
});
export type MockPerfil = z.infer<typeof MockPerfilSchema>;

export function parseMockPerfil(raw: string | undefined): MockPerfil {
  if (!raw?.trim()) return {};
  try {
    const parsed = MockPerfilSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.warn('[mock] MOCK_PERFIL inválido, usando exemplo padrão:', z.prettifyError(parsed.error));
  } catch {
    console.warn('[mock] MOCK_PERFIL não é um JSON válido, usando exemplo padrão');
  }
  return {};
}

// PDF da CNH para a demonstração: Secret File do Render (arquivo privado, fora do git).
// Aceita o PDF puro ou o conteúdo em base64 (Secret Files são texto).
export function loadMockPdf(path: string | undefined): Buffer | undefined {
  if (!path) return undefined;
  try {
    const raw = readFileSync(path);
    if (raw.subarray(0, 5).toString() === '%PDF-') return raw;
    const decoded = Buffer.from(raw.toString('utf8').replace(/\s+/g, ''), 'base64');
    return decoded.subarray(0, 5).toString() === '%PDF-' ? decoded : undefined;
  } catch {
    console.warn('[mock] MOCK_CNH_PDF não encontrado, usando o PDF de exemplo');
    return undefined;
  }
}
