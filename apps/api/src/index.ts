import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import { env } from './env.ts';
import { migrate } from './db/migrate.ts';
import { authRoutes } from './routes/auth.ts';
import { syncRoutes } from './routes/sync.ts';

const app = Fastify({ logger: { level: 'info' }, trustProxy: true });

await app.register(cookie);
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(syncRoutes, { prefix: '/api/sync' });

app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

app.setErrorHandler((error: FastifyError, _request, reply) => {
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  app.log.error(error);
  return reply.code(status).send({ error: status === 500 ? 'internal' : error.message });
});

await migrate();
await app.listen({ port: env.PORT, host: env.HOST });
