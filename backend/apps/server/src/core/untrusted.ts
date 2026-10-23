import type { z } from 'zod';

// Tudo que vem do portal gov.br/DETRAN ou de APIs externas é dado não confiável:
// pode conter texto tentando instruir o modelo (prompt injection). Nunca repassar
// texto cru para a voz ou para o Grok como instrução — sempre validar com o schema
// do contrato e usar só os campos tipados.
export class UntrustedDataError extends Error {
  constructor(public source: string, public issues: unknown) {
    super(`Dado inválido vindo de ${source}`);
  }
}

export function fromPortal<S extends z.ZodType>(source: string, schema: S, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new UntrustedDataError(source, parsed.error.issues);
  return parsed.data;
}
