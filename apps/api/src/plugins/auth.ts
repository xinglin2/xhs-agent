import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { eq } from 'drizzle-orm';
import { users } from '@xhs/db';
import { createLogger, generateTraceId } from '@xhs/logger';
import type { ApiResponse } from '@xhs/shared';

const log = createLogger('auth-plugin');

// ── JWT payload shape ────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

// ── Augment @fastify/jwt to type request.user ─────────────────────────────────

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: {
      id: string;
      email: string;
      role: 'user' | 'admin';
    };
  }
}

// ── Augment Fastify to add decorators + traceId ───────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const authPluginImpl: FastifyPluginAsync = async (app) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '15m' },
  });

  // ── authenticate decorator ─────────────────────────────────────────────────

  app.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const traceId = request.traceId ?? generateTraceId();

      try {
        const token = extractBearerToken(request);
        if (!token) {
          return sendUnauthorized(reply, traceId, 'Missing authorization token');
        }

        const payload = app.jwt.verify<JwtPayload>(token);

        if (payload.role === 'user') {
          const result = await app.db
            .select({ disabledAt: users.disabledAt })
            .from(users)
            .where(eq(users.id, payload.sub))
            .limit(1);

          if (result[0]?.disabledAt != null) {
            return sendUnauthorized(reply, traceId, 'Account is disabled');
          }
        }

        request.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown';
        log.warn({ traceId, err: msg }, 'JWT verification failed');
        return sendUnauthorized(reply, traceId, 'Invalid or expired token');
      }
    },
  );

  // ── authenticateAdmin decorator ────────────────────────────────────────────

  app.decorate(
    'authenticateAdmin',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const traceId = request.traceId ?? generateTraceId();

      try {
        const token = extractBearerToken(request);
        if (!token) {
          return sendUnauthorized(reply, traceId, 'Missing authorization token');
        }

        const payload = app.jwt.verify<JwtPayload>(token);

        if (payload.role !== 'admin') {
          const response: ApiResponse<never> = {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: 'Admin access required' },
            traceId,
          };
          return reply.code(403).send(response);
        }

        request.user = {
          id: payload.sub,
          email: payload.email,
          role: 'admin',
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown';
        log.warn({ traceId, err: msg }, 'Admin JWT verification failed');
        return sendUnauthorized(reply, traceId, 'Invalid or expired token');
      }
    },
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

function sendUnauthorized(reply: FastifyReply, traceId: string, message: string) {
  const response: ApiResponse<never> = {
    ok: false,
    error: { code: 'UNAUTHORIZED', message },
    traceId,
  };
  return reply.code(401).send(response);
}

export const authPlugin = fp(authPluginImpl, {
  name: 'auth-plugin',
  dependencies: ['db-plugin'],
});
