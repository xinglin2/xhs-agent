import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { createLogger, generateTraceId } from '@xhs/logger';

import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { authPlugin } from './plugins/auth.js';

import { authRoutes } from './routes/auth.js';
import { generateRoutes } from './routes/generate.js';
import { imagesRoutes } from './routes/images.js';
import { postsRoutes } from './routes/posts.js';
import { publishRoutes } from './routes/publish.js';
import { xhsRoutes } from './routes/xhs.js';
import { adminRoutes } from './routes/admin.js';

import type { ApiResponse } from '@xhs/shared';

const log = createLogger('api');

// ── Build app ─────────────────────────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino logger
    genReqId: () => generateTraceId(),
  });

  // ── Trace ID ─────────────────────────────────────────────────────────────────
  app.addHook('onRequest', async (request) => {
    const traceId =
      (request.headers['x-trace-id'] as string | undefined) ?? generateTraceId();
    (request as any).traceId = traceId;
  });

  // ── CORS ──────────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (req, context) => {
      const traceId = (req as any).traceId ?? generateTraceId();
      const response: ApiResponse<never> = {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
        },
        traceId,
      };
      return response;
    },
  });

  // ── Multipart (file uploads) ──────────────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 9,
    },
  });

  // ── Plugins ───────────────────────────────────────────────────────────────────
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);

  // ── Health check ──────────────────────────────────────────────────────────────
  app.get('/health', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const response: ApiResponse<{ status: string; uptime: number }> = {
      ok: true,
      data: {
        status: 'ok',
        uptime: process.uptime(),
      },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // ── Routes ────────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(generateRoutes, { prefix: '/api' });
  await app.register(imagesRoutes, { prefix: '/api' });
  await app.register(postsRoutes, { prefix: '/api' });
  await app.register(publishRoutes, { prefix: '/api' });
  await app.register(xhsRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/admin' });

  // ── Global error handler ──────────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    const traceId = (request as any).traceId ?? generateTraceId();
    log.error({ traceId, err: error }, 'Unhandled error');

    // Rate limit errors from @fastify/rate-limit are already formatted
    if (reply.statusCode === 429) {
      return reply.send(error);
    }

    const statusCode = error.statusCode ?? 500;
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message: error.message ?? 'An unexpected error occurred',
      },
      traceId,
    };
    return reply.code(statusCode).send(response);
  });

  // ── 404 handler ───────────────────────────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    const traceId = (request as any).traceId ?? generateTraceId();
    const response: ApiResponse<never> = {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      traceId,
    };
    return reply.code(404).send(response);
  });

  return app;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    log.info({ port, host }, `API server listening`);
  } catch (err) {
    log.error(err, 'Failed to start server');
    process.exit(1);
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    try {
      await app.close();
      log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
