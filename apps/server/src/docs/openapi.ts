import { z } from 'zod';
import {
  CnhSchema,
  DecisionSchema,
  GuiaSchema,
  SessionStateSchema,
  MultaSchema,
  ResumoPontosSchema,
  StepEventSchema,
  ToolErrorCodeSchema,
  ToolInputs,
  ToolResults,
  VeiculoSchema,
} from '@hackathon/contracts';
import { listToolSchemas } from '../tools/registry.ts';

// Gerado a partir dos contratos Zod: se o contrato muda, o Swagger muda junto.
const schema = (s: z.ZodType) => {
  const { $schema, ...json } = z.toJSONSchema(s, { io: 'output' }) as Record<string, unknown>;
  return json;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (s: object) => ({ content: { 'application/json': { schema: s } } });
const errorBody = (code: string) =>
  json({ type: 'object', properties: { code: { type: 'string', enum: [code] } }, required: ['code'] });

const toolErrors = {
  400: { description: 'INVALID_INPUT', ...json(ref('ToolError')) },
  401: { description: 'Sessão ausente ou token inválido', ...errorBody('UNAUTHORIZED') },
  404: { description: 'UNKNOWN_TOOL ou NOT_FOUND', ...json(ref('ToolError')) },
  409: { description: 'UF_REQUIRED, LOGIN_REQUIRED ou BAD_SOURCE_DATA', ...json(ref('ToolError')) },
  501: { description: 'NOT_IMPLEMENTED (serviço real ainda não feito)', ...json(ref('ToolError')) },
};

const WS_DOCS = `
### WebSocket \`/ws\` — etapas em tempo real
1. Conectar em \`ws(s)://<host>/ws\`
2. Em até 5 s enviar \`{"type":"auth","sessionId":"<id>","token":"<token>"}\`
3. Servidor responde \`{"type":"ready"}\` e passa a enviar um **StepEvent** por etapa.
Token errado fecha com código **4401**; JSON inválido com **4400**.

### Voz
1. \`POST /voice/token\` → token temporário da OpenAI Realtime (já com instruções e tools)
2. Frontend conecta via WebRTC direto na OpenAI com esse token
3. Quando o modelo pedir uma tool, chamar \`POST /tools/{nome}\` e devolver o JSON ao modelo
`;

export function buildOpenApi() {
  const tools = listToolSchemas();
  const toolPaths = Object.fromEntries(
    tools.map((t) => [
      `/tools/${t.name}`,
      {
        post: {
          tags: ['Tools'],
          summary: t.name,
          description: t.description,
          security: [{ sessionId: [], bearer: [] }],
          requestBody: { required: false, ...json(schema(ToolInputs[t.name])) },
          responses: {
            200: {
              description: 'Sucesso',
              ...json({
                type: 'object',
                properties: { ok: { const: true }, result: schema(ToolResults[t.name]) },
                required: ['ok', 'result'],
              }),
            },
            ...toolErrors,
          },
        },
      },
    ]),
  );

  return {
    openapi: '3.1.0',
    info: {
      title: 'Assistente DETRAN — Backend',
      version: '0.2.0',
      description:
        'Todas as rotas (menos /session e /health) exigem os headers `x-session-id` e `Authorization: Bearer <token>` recebidos em `POST /session`.\n' +
        WS_DOCS,
    },
    tags: [{ name: 'Sessão' }, { name: 'Voz' }, { name: 'Tools' }, { name: 'Arquivos' }],
    components: {
      securitySchemes: {
        sessionId: { type: 'apiKey', in: 'header', name: 'x-session-id' },
        bearer: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Cnh: schema(CnhSchema),
        Multa: schema(MultaSchema),
        ResumoPontos: schema(ResumoPontosSchema),
        Guia: schema(GuiaSchema),
        Veiculo: schema(VeiculoSchema),
        StepEvent: schema(StepEventSchema),
        Decision: schema(DecisionSchema),
        SessionState: schema(SessionStateSchema),
        ToolError: {
          type: 'object',
          properties: {
            ok: { const: false },
            code: schema(ToolErrorCodeSchema),
            message: { type: 'string' },
            next: { ...ref('Decision'), description: 'Presente em UF_REQUIRED/LOGIN_REQUIRED: qual tool chamar antes' },
          },
          required: ['ok', 'code', 'message'],
        },
      },
    },
    paths: {
      '/health': {
        get: { tags: ['Sessão'], summary: 'Status do servidor', responses: { 200: { description: 'OK', ...json({ type: 'object', properties: { ok: { type: 'boolean' }, mock: { type: 'boolean' } } }) } } },
      },
      '/session': {
        post: {
          tags: ['Sessão'],
          summary: 'Cria sessão (10/min por IP)',
          description: 'Guarde `id` e `token`. A sessão expira após 30 min sem uso.',
          responses: {
            200: { description: 'Sessão criada', ...json({ type: 'object', properties: { id: { type: 'string', format: 'uuid' }, token: { type: 'string' } }, required: ['id', 'token'] }) },
            429: { description: 'Limite por IP' },
          },
        },
      },
      '/session/state': {
        get: {
          tags: ['Sessão'],
          summary: 'Estado da sessão e próximo passo sugerido',
          description: '`next` vem da OpenAI Decisions API quando a confiança é alta (`source: "decisions"`); senão das regras fixas (`source: "rules"`).',
          security: [{ sessionId: [], bearer: [] }],
          responses: { 200: { description: 'Estado', ...json(ref('SessionState')) }, 401: toolErrors[401] },
        },
      },
      '/tools': {
        get: {
          tags: ['Tools'],
          summary: 'Lista as tools (JSON Schema)',
          security: [{ sessionId: [], bearer: [] }],
          responses: { 200: { description: 'Tools', ...json({ type: 'array', items: { type: 'object' } }) }, 401: toolErrors[401] },
        },
      },
      '/voice/token': {
        post: {
          tags: ['Voz'],
          summary: 'Token temporário da OpenAI Realtime (5/min por IP, 20 por sessão)',
          security: [{ sessionId: [], bearer: [] }],
          responses: {
            200: { description: 'Token', ...json({ type: 'object', properties: { token: { type: 'string' }, expiresAt: { type: 'integer' }, model: { type: 'string' } }, required: ['token', 'expiresAt', 'model'] }) },
            401: toolErrors[401],
            429: { description: 'Limite da sessão', ...errorBody('VOICE_LIMIT_REACHED') },
            502: { description: 'OpenAI falhou', ...errorBody('VOICE_UPSTREAM_ERROR') },
            503: { description: 'OPENAI_API_KEY não configurada', ...errorBody('VOICE_NOT_CONFIGURED') },
          },
        },
      },
      '/files/{id}': {
        get: {
          tags: ['Arquivos'],
          summary: 'Baixa PDF (CNH, guia). Só a sessão dona.',
          security: [{ sessionId: [], bearer: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Arquivo', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
            401: toolErrors[401],
            404: { description: 'Não existe ou é de outra sessão', ...errorBody('NOT_FOUND') },
          },
        },
      },
      ...toolPaths,
    },
  };
}
