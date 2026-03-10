import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { users, adminUsers } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import type { ApiResponse, AuthTokens, User } from '@xhs/shared';

const BCRYPT_COST = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TOKEN_PREFIX = 'refresh:';
const BLACKLIST_PREFIX = 'blacklist:';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ── Helper: map DB user → API User ───────────────────────────────────────────

function toApiUser(u: typeof users.$inferSelect): User {
  return {
    id: u.id,
    email: u.email,
    createdAt: u.createdAt.toISOString(),
    disabledAt: u.disabledAt?.toISOString() ?? null,
    xhsSessionLinkedAt: u.xhsSessionLinkedAt?.toISOString() ?? null,
    xhsSessionValidatedAt: u.xhsSessionValidatedAt?.toISOString() ?? null,
    consentAcceptedAt: u.consentAcceptedAt?.toISOString() ?? null,
    publishModePref: u.publishModePref,
    preferredLlm: u.preferredLlm,
    defaultTone: u.defaultTone as User['defaultTone'],
    defaultRatio: u.defaultRatio,
    preferredLanguage: u.preferredLanguage,
  };
}

// ── Helper: issue tokens ──────────────────────────────────────────────────────

async function issueTokens(
  app: any,
  userId: string,
  email: string,
  role: 'user' | 'admin',
): Promise<AuthTokens> {
  const accessToken: string = app.jwt.sign(
    { sub: userId, email, role },
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );

  const refreshToken = randomUUID();
  const refreshKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  await app.redis.setex(
    refreshKey,
    REFRESH_TOKEN_TTL_SECONDS,
    JSON.stringify({ userId, email, role }),
  );

  return { accessToken, refreshToken };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/register
  app.post('/register', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('auth', traceId);

    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Validation failed',
          field: parsed.error.errors[0]?.path.join('.'),
        },
        traceId,
      };
      return reply.code(400).send(response);
    }

    const { email, password } = parsed.data;

    // Check existing user
    const existing = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email already registered', field: 'email' },
        traceId,
      };
      return reply.code(409).send(response);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const [newUser] = await app.db
      .insert(users)
      .values({ email, passwordHash })
      .returning();

    log.info({ userId: newUser.id }, 'User registered');

    const tokens = await issueTokens(app, newUser.id, newUser.email, 'user');

    const response: ApiResponse<{ user: User } & AuthTokens> = {
      ok: true,
      data: { user: toApiUser(newUser), ...tokens },
      traceId,
    };
    return reply.code(201).send(response);
  });

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('auth', traceId);

    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Validation failed',
          field: parsed.error.errors[0]?.path.join('.'),
        },
        traceId,
      };
      return reply.code(400).send(response);
    }

    const { email, password } = parsed.data;

    // Try regular user first
    const [user] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      if (user.disabledAt) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Account is disabled' },
          traceId,
        };
        return reply.code(403).send(response);
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
          traceId,
        };
        return reply.code(401).send(response);
      }

      log.info({ userId: user.id }, 'User logged in');
      const tokens = await issueTokens(app, user.id, user.email, 'user');

      const response: ApiResponse<{ user: User } & AuthTokens> = {
        ok: true,
        data: { user: toApiUser(user), ...tokens },
        traceId,
      };
      return reply.code(200).send(response);
    }

    // Try admin user
    const [admin] = await app.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);

    if (admin) {
      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
          traceId,
        };
        return reply.code(401).send(response);
      }

      // Update lastLoginAt
      await app.db
        .update(adminUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(adminUsers.id, admin.id));

      log.info({ adminId: admin.id }, 'Admin logged in');
      const tokens = await issueTokens(app, admin.id, admin.email, 'admin');

      // Return a simplified user-like object for admin
      const adminUser: User = {
        id: admin.id,
        email: admin.email,
        createdAt: admin.createdAt.toISOString(),
        disabledAt: null,
        xhsSessionLinkedAt: null,
        xhsSessionValidatedAt: null,
        consentAcceptedAt: null,
        publishModePref: 'clipboard',
        preferredLlm: 'openai',
        defaultTone: 'warm',
        defaultRatio: '3:4',
        preferredLanguage: 'zh-CN',
      };

      const response: ApiResponse<{ user: User; role: 'admin' } & AuthTokens> = {
        ok: true,
        data: { user: adminUser, role: 'admin', ...tokens },
        traceId,
      };
      return reply.code(200).send(response);
    }

    // Neither user nor admin found
    const response: ApiResponse<never> = {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      traceId,
    };
    return reply.code(401).send(response);
  });

  // POST /auth/logout
  app.post(
    '/logout',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const traceId = (request as any).traceId as string;
      const { log } = createRequestLogger('auth', traceId);

      const body = request.body as any;
      const refreshToken = body?.refreshToken as string | undefined;

      if (refreshToken) {
        // Blacklist the refresh token
        const blacklistKey = `${BLACKLIST_PREFIX}${refreshToken}`;
        await app.redis.setex(blacklistKey, REFRESH_TOKEN_TTL_SECONDS, '1');

        // Delete the refresh token entry
        const refreshKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
        await app.redis.del(refreshKey);

        log.info({ userId: request.user.id }, 'User logged out, token invalidated');
      }

      const response: ApiResponse<{ message: string }> = {
        ok: true,
        data: { message: 'Logged out successfully' },
        traceId,
      };
      return reply.code(200).send(response);
    },
  );

  // GET /auth/me
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const traceId = (request as any).traceId as string;

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, request.user.id))
        .limit(1);

      if (!user) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
          traceId,
        };
        return reply.code(404).send(response);
      }

      const response: ApiResponse<User> = {
        ok: true,
        data: toApiUser(user),
        traceId,
      };
      return reply.code(200).send(response);
    },
  );
};
