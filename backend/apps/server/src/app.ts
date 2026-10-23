import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { createAdapters, type Adapters } from './adapters/index.ts';
import { createExtractor } from './ai/extract.ts';
import { createBrowserbaseProvider } from './browser/browserbase.ts';
import { BrowserManager } from './browser/manager.ts';
import type { BrowserProvider } from './browser/types.ts';
import type { Config } from './core/config.ts';
import { startKeepAlive } from './core/keep-alive.ts';
import { fileShareText, shareLinks } from './core/share.ts';
import { buildOpenApi } from './docs/openapi.ts';
import { registerMcp } from './mcp/server.ts';
import { Orchestrator } from './orchestrator/index.ts';
import { createDecisionsClient } from './orchestrator/decisions.ts';
import { EventBus } from './core/events.ts';
import { FileStore } from './core/files.ts';
import { type Session, SessionStore } from './core/session-store.ts';
import { listToolSchemas, runTool } from './tools/registry.ts';
import { createVoiceToken, VoiceUpstreamError } from './voice/token.ts';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: Session;
  }
}

const WsAuthSchema = z.object({ type: z.literal('auth'), sessionId: z.string(), token: z.string() });

type Deps = { fetch: typeof fetch; browserProvider?: BrowserProvider; adapters?: Adapters };

export async function buildApp(config: Config, overrides: Partial<Deps> = {}) {
  const fetchImpl = overrides.fetch ?? globalThis.fetch;
  const deps: Deps = {
    fetch: fetchImpl,
    browserProvider:
      overrides.browserProvider ??
      (config.browserbaseApiKey ? createBrowserbaseProvider(config, fetchImpl) : undefined),
    adapters: overrides.adapters,
  };
  const adapters = deps.adapters ?? createAdapters(config, fetchImpl);
  const app = Fastify({
    // Atrás do proxy da hospedagem: IP real do cliente (rate limit) e https no link de compartilhamento.
    trustProxy: config.trustProxy,
    logger: config.mock
      ? false
      : {
          redact: ['req.headers.authorization', 'req.headers["x-session-id"]'],
          // Token de link compartilhado nunca vai para o log.
          serializers: { req: (req) => ({ method: req.method, url: req.url.replace(/^\/s\/[^/?]+/, '/s/***') }) },
        },
  });
  const events = new EventBus();
  const files = new FileStore(config.fileTtlMs);
  const browsers = new BrowserManager(config, deps.browserProvider);
  const extractor = createExtractor(config, deps.fetch);
  const sessions = new SessionStore(config.sessionTtlMs, (id) => {
    events.drop(id);
    files.dropOwner(id);
    void browsers.close(id);
  });
  const stopKeepAlive = config.keepAliveUrl
    ? startKeepAlive(config.keepAliveUrl, config.keepAliveIntervalMs, deps.fetch, (err) =>
        app.log.warn({ err }, 'keep-alive falhou'),
      )
    : () => {};
  app.addHook('onClose', async () => {
    stopKeepAlive();
    sessions.close();
    await browsers.closeAll();
  });
  const orchestrator = new Orchestrator(createDecisionsClient(config, deps.fetch));
  // Mesma execução para REST, voz e MCP.
  const runToolFor = (session: Session, name: string, input: unknown) =>
    runTool(name, input, { session, config, files, browsers, extractor, adapters }, events);

  // Corpo vazio com content-type JSON vira {} em vez de erro 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '') return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error('JSON inválido'), { statusCode: 400 }), undefined);
    }
  });

  await app.register(cors, { origin: config.corsOrigins });
  await app.register(rateLimit, { global: false });
  await app.register(websocket);
  await app.register(swagger, { mode: 'static', specification: { document: buildOpenApi() as never } });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/openapi.json', async () => app.swagger());

  // Toda rota com dados do usuário exige x-session-id + Authorization: Bearer <token>.
  const requireSession = async (req: FastifyRequest, reply: FastifyReply) => {
    const id = req.headers['x-session-id'];
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const session = typeof id === 'string' && token ? sessions.authenticate(id, token) : undefined;
    if (!session) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    req.auth = session;
  };

  app.get('/health', async () => ({ ok: true, mock: config.mock }));
  app.post('/session', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async () => {
    const { session, token } = sessions.create();
    return { id: session.id, token };
  });

  app.get('/session/state', { preHandler: requireSession }, async (req) => orchestrator.state(req.auth!));

  app.get('/tools', { preHandler: requireSession }, async () => listToolSchemas());

  app.post(
    '/voice/token',
    { preHandler: requireSession, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const session = req.auth!;
      if (!config.openaiApiKey) return reply.code(503).send({ code: 'VOICE_NOT_CONFIGURED' });
      if (session.voiceTokensIssued >= config.maxVoiceTokensPerSession) {
        return reply.code(429).send({ code: 'VOICE_LIMIT_REACHED' });
      }
      session.voiceTokensIssued++;
      try {
        return await createVoiceToken(config, fetchImpl);
      } catch (err) {
        if (!(err instanceof VoiceUpstreamError)) throw err;
        req.log.warn({ status: err.status }, 'falha ao gerar token de voz');
        return reply.code(502).send({ code: 'VOICE_UPSTREAM_ERROR' });
      }
    },
  );

  app.post<{ Params: { name: string } }>(
    '/tools/:name',
    { preHandler: requireSession, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const result = await runToolFor(req.auth!, req.params.name, req.body);
      if (!result.ok) {
        const status = {
          UNKNOWN_TOOL: 404,
          NOT_FOUND: 404,
          INVALID_INPUT: 400,
          IDENTIFIERS_REQUIRED: 400,
          BAD_SOURCE_DATA: 502,
          SOURCE_UNAVAILABLE: 502,
          EXTRACTION_FAILED: 502,
          BROWSER_UNAVAILABLE: 503,
          NOT_IMPLEMENTED: 501,
        }[result.code] ?? 409;
        return reply.code(status).send(result);
      }
      return result;
    },
  );

  app.get<{ Params: { id: string } }>('/files/:id', { preHandler: requireSession }, async (req, reply) => {
    const file = files.get(req.params.id, req.auth!.id);
    if (!file) return reply.code(404).send({ code: 'NOT_FOUND' });
    return reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .header('cache-control', 'no-store')
      .send(file.body);
  });

  // Gera link público de 15 min + textos prontos para WhatsApp e e-mail.
  app.post<{ Params: { id: string } }>(
    '/files/:id/share',
    { preHandler: requireSession, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const shared = files.share(req.params.id, req.auth!.id);
      if (!shared) return reply.code(404).send({ code: 'NOT_FOUND' });
      const base = config.publicUrl ?? `${req.protocol}://${req.host}`;
      const url = `${base.replace(/\/$/, '')}/s/${shared.token}`;
      return {
        url,
        expiresAt: new Date(shared.expiresAt).toISOString(),
        ...shareLinks(fileShareText(shared.file.title, url, shared.expiresAt), shared.file.title),
      };
    },
  );

  app.get<{ Params: { token: string } }>(
    '/s/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const file = files.getShared(req.params.token);
      if (!file) return reply.code(404).type('text/plain; charset=utf-8').send('Link expirado ou inválido.');
      return reply
        .header('content-type', file.contentType)
        .header('content-disposition', `inline; filename="${file.filename}"`)
        .header('cache-control', 'no-store')
        .header('x-robots-tag', 'noindex')
        .header('referrer-policy', 'no-referrer')
        .send(file.body);
    },
  );

  // Navegador não manda header no WebSocket: a primeira mensagem precisa ser o auth.
  app.get('/ws', { websocket: true }, (socket) => {
    let unsubscribe: (() => void) | undefined;
    const timeout = setTimeout(() => socket.close(4401, 'auth timeout'), 5_000);

    socket.on('message', (raw) => {
      if (unsubscribe) return;
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return socket.close(4400, 'invalid json');
      }
      const auth = WsAuthSchema.safeParse(msg);
      const session = auth.success ? sessions.authenticate(auth.data.sessionId, auth.data.token) : undefined;
      if (!session) return socket.close(4401, 'unauthorized');
      clearTimeout(timeout);
      unsubscribe = events.subscribe(session.id, (event) => socket.send(JSON.stringify(event)));
      socket.send(JSON.stringify({ type: 'ready' }));
    });
    socket.on('close', () => {
      clearTimeout(timeout);
      unsubscribe?.();
    });
  });

  registerMcp(app, { config, sessions, files, orchestrator, run: runToolFor });

  return app;
}
