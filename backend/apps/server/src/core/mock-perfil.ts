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
