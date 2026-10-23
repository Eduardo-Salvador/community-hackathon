import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import type { Config } from './core/config.ts';
import { EventBus } from './core/events.ts';
import { FileStore } from './core/files.ts';
import { type Session, SessionStore } from './core/session-store.ts';
import { listToolSchemas, runTool } from './tools/registry.ts';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: Session;
  }
}

const WsAuthSchema = z.object({ type: z.literal('auth'), sessionId: z.string(), token: z.string() });

export async function buildApp(config: Config) {
  const app = Fastify({
    logger: config.mock ? false : { redact: ['req.headers.authorization', 'req.headers["x-session-id"]'] },
  });
  const events = new EventBus();
  const files = new FileStore(config.fileTtlMs);
  const sessions = new SessionStore(config.sessionTtlMs, (id) => {
    events.drop(id);
    files.dropOwner(id);
  });
  app.addHook('onClose', async () => sessions.close());

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(rateLimit, { global: false });
  await app.register(websocket);

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

  app.get('/tools', { preHandler: requireSession }, async () => listToolSchemas());

  app.post<{ Params: { name: string } }>(
    '/tools/:name',
    { preHandler: requireSession, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const result = await runTool(req.params.name, req.body, { session: req.auth!, config, files }, events);
      if (!result.ok) {
        const status = result.code === 'UNKNOWN_TOOL' ? 404 : result.code === 'INVALID_INPUT' ? 400 : 409;
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

  return app;
}
