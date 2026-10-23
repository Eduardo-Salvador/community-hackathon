import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { MultaSchema } from '@hackathon/contracts';
import { createExtractor, dropNulls, toStrictSchema } from '../src/ai/extract.ts';
import { loadConfig } from '../src/core/config.ts';

// Todo objeto do schema enviado precisa ter todas as chaves em required e additionalProperties=false.
function assertStrict(schema: any, path = '$') {
  if (schema.type === 'object' && schema.properties) {
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path}.required`);
    assert.equal(schema.additionalProperties, false, `${path}.additionalProperties`);
    for (const [k, v] of Object.entries(schema.properties)) assertStrict(v, `${path}.${k}`);
  }
  if (schema.items) assertStrict(schema.items, `${path}[]`);
  for (const s of schema.anyOf ?? []) assertStrict(s, path);
}

test('schema da extração fica compatível com strict, inclusive campos opcionais aninhados', () => {
  const schema = z.object({ ear: z.boolean(), multas: z.array(MultaSchema.omit({ pontos: true, expiraContagemEm: true })) });
  const { $schema, ...raw } = z.toJSONSchema(schema, { io: 'input' }) as any;
  const strict = toStrictSchema(raw) as any;
  assertStrict(strict);
  const multa = strict.properties.multas.items;
  assert.deepEqual(multa.properties.valorComDesconto.anyOf[1], { type: 'null' });
  assert.equal(multa.properties.descricao.anyOf, undefined, 'campo obrigatório continua sem null');
});

test('null devolvido pelo modelo vira campo ausente antes de validar', async () => {
  let body: any;
  const fakeFetch = (async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    const text = JSON.stringify({ nome: 'X', apelido: null, itens: [{ a: 1, b: null }] });
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
  }) as typeof fetch;
  const extractor = createExtractor(loadConfig({ OPENAI_API_KEY: 'sk' }), fakeFetch);
  const schema = z.object({
    nome: z.string(),
    apelido: z.string().optional(),
    itens: z.array(z.object({ a: z.number(), b: z.number().optional() })),
  });
  const result = await extractor.extract('teste', schema, 'pagina');
  assert.deepEqual(result, { nome: 'X', itens: [{ a: 1 }] });
  assertStrict(body.text.format.schema);
  assert.equal(body.text.format.strict, true);
});

test('dropNulls preserva valores falsy que não são null', () => {
  assert.deepEqual(dropNulls({ a: 0, b: false, c: '', d: null, e: [null, 1] }), { a: 0, b: false, c: '', e: [null, 1] });
});
