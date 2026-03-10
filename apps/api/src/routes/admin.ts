import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';
import { users, posts, usageLogs, apiKeys, publishJobs } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import { encrypt, maskApiKey } from '../lib/encryption.js';
import type { ApiResponse, AdminStats, ApiKey, UsageLog, User } from '@xhs/shared';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const LogsQuerySchema = PaginationSchema.extend({
  actionType: z
    .enum([
      'generate_content',
      'process_image',
      'publish_clipboard',
      'publish_auto',
      'xhs_link',
      'xhs_validate',
    ])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const AddApiKeySchema = z.object({
  provider: z.enum(['openai', 'qwen']),
  key: z.string().min(10, 'API key too short'),
});

// ── Routes ────────────────────────────────────────────────────────────────────

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // All routes require admin auth
  app.addHook('preHandler', app.authenticateAdmin);

  // GET /admin/users — paginated user list with post counts
  app.get('/users', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);

    const parsed = PaginationSchema.safeParse(request.query);
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
        traceId,
      };
      return reply.code(400).send(response);
    }

    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [userRows, countRows] = await Promise.all([
      app.db
        .select({
          id: users.id,
          email: users.email,
          createdAt: users.createdAt,
          disabledAt: users.disabledAt,
          xhsSessionLinkedAt: users.xhsSessionLinkedAt,
          xhsSessionValidatedAt: users.xhsSessionValidatedAt,
          consentAcceptedAt: users.consentAcceptedAt,
          publishModePref: users.publishModePref,
          preferredLlm: users.preferredLlm,
          defaultTone: users.defaultTone,
          defaultRatio: users.defaultRatio,
          preferredLanguage: users.preferredLanguage,
          postCount: sql<number>`(
            SELECT COUNT(*)::int FROM posts WHERE posts.user_id = users.id
          )`,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),
      app.db.select({ count: sql<number>`count(*)::int` }).from(users),
    ]);

    const total = countRows[0]?.count ?? 0;

    log.info({ page, limit, total }, 'Admin: users fetched');

    const response: ApiResponse<{
      users: (User & { postCount: number })[]; total: number; page: number; pages: number;
    }> = {
      ok: true,
      data: {
        users: userRows.map((u) => ({
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
          postCount: u.postCount ?? 0,
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
      },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // PATCH /admin/users/:id/disable
  app.patch('/users/:id/disable', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);
    const { id } = request.params as { id: string };

    const [user] = await app.db
      .select({ id: users.id, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    const now = user.disabledAt ? null : new Date(); // Toggle

    await app.db
      .update(users)
      .set({ disabledAt: now, updatedAt: new Date() })
      .where(eq(users.id, id));

    log.info({ userId: id, disabled: !!now }, 'Admin: user disable toggled');

    const response: ApiResponse<{ userId: string; disabled: boolean; disabledAt: string | null }> = {
      ok: true,
      data: { userId: id, disabled: !!now, disabledAt: now?.toISOString() ?? null },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // GET /admin/logs — paginated usage logs
  app.get('/logs', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);

    const parsed = LogsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
        traceId,
      };
      return reply.code(400).send(response);
    }

    const { page, limit, actionType, from, to } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (actionType) conditions.push(eq(usageLogs.actionType, actionType));
    if (from) conditions.push(gte(usageLogs.createdAt, new Date(from)) as any);
    if (to) conditions.push(lte(usageLogs.createdAt, new Date(to)) as any);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logRows, countRows] = await Promise.all([
      app.db
        .select()
        .from(usageLogs)
        .where(whereClause)
        .orderBy(desc(usageLogs.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(usageLogs)
        .where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    log.info({ page, limit, total, actionType }, 'Admin: logs fetched');

    const apiLogs: UsageLog[] = logRows.map((l) => ({
      id: l.id,
      userId: l.userId ?? '',
      actionType: l.actionType,
      tokensUsed: l.tokensUsed ?? null,
      modelUsed: l.modelUsed ?? null,
      costEstimate: l.costEstimate ?? null,
      createdAt: l.createdAt.toISOString(),
      traceId: l.traceId,
    }));

    const response: ApiResponse<{ logs: UsageLog[]; total: number; page: number; pages: number }> = {
      ok: true,
      data: { logs: apiLogs, total, page, pages: Math.ceil(total / limit) },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // GET /admin/stats — aggregate dashboard stats
  app.get('/stats', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterday24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsersResult,
      activeUsersResult,
      postsToday,
      publishStatsResult,
      costTodayResult,
    ] = await Promise.all([
      app.db.select({ count: sql<number>`count(*)::int` }).from(users),
      app.db
        .select({ count: sql<number>`count(distinct user_id)::int` })
        .from(usageLogs)
        .where(gte(usageLogs.createdAt, yesterday24h) as any),
      app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(gte(posts.createdAt, todayStart) as any),
      app.db
        .select({
          total: sql<number>`count(*)::int`,
          succeeded: sql<number>`sum(case when status = 'succeeded' then 1 else 0 end)::int`,
        })
        .from(publishJobs)
        .where(gte(publishJobs.createdAt, todayStart) as any),
      app.db
        .select({ total: sql<number>`coalesce(sum(cost_estimate), 0)` })
        .from(usageLogs)
        .where(gte(usageLogs.createdAt, todayStart) as any),
    ]);

    const totalPublishJobs = publishStatsResult[0]?.total ?? 0;
    const succeededJobs = publishStatsResult[0]?.succeeded ?? 0;
    const successRate =
      totalPublishJobs > 0 ? succeededJobs / totalPublishJobs : 0;

    log.info({ traceId }, 'Admin: stats computed');

    const stats: AdminStats = {
      totalUsers: totalUsersResult[0]?.count ?? 0,
      activeUsers24h: activeUsersResult[0]?.count ?? 0,
      totalPostsToday: postsToday[0]?.count ?? 0,
      publishSuccessRate: successRate,
      estimatedCostToday: Number(costTodayResult[0]?.total ?? 0),
    };

    const response: ApiResponse<AdminStats> = {
      ok: true,
      data: stats,
      traceId,
    };
    return reply.code(200).send(response);
  });

  // GET /admin/api-keys — list keys (masked)
  app.get('/api-keys', async (request, reply) => {
    const traceId = (request as any).traceId as string;

    const keys = await app.db
      .select({
        id: apiKeys.id,
        provider: apiKeys.provider,
        keyMasked: apiKeys.keyMasked,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));

    const apiKeyList: ApiKey[] = keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      keyMasked: k.keyMasked,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
    }));

    const response: ApiResponse<{ keys: ApiKey[] }> = {
      ok: true,
      data: { keys: apiKeyList },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // POST /admin/api-keys — add new key
  app.post('/api-keys', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);

    const parsed = AddApiKeySchema.safeParse(request.body);
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

    const { provider, key } = parsed.data;
    const keyEncrypted = encrypt(key);
    const keyMasked = maskApiKey(key);

    const [newKey] = await app.db
      .insert(apiKeys)
      .values({
        provider,
        keyEncrypted,
        keyMasked,
        createdBy: request.user.id,
      })
      .returning({
        id: apiKeys.id,
        provider: apiKeys.provider,
        keyMasked: apiKeys.keyMasked,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      });

    log.info({ provider, keyId: newKey.id }, 'Admin: API key added');

    const response: ApiResponse<ApiKey> = {
      ok: true,
      data: {
        id: newKey.id,
        provider: newKey.provider,
        keyMasked: newKey.keyMasked,
        isActive: newKey.isActive,
        createdAt: newKey.createdAt.toISOString(),
      },
      traceId,
    };
    return reply.code(201).send(response);
  });

  // PATCH /admin/api-keys/:id/activate — toggle is_active
  app.patch('/api-keys/:id/activate', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);
    const { id } = request.params as { id: string };

    const [key] = await app.db
      .select({ id: apiKeys.id, isActive: apiKeys.isActive })
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (!key) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    const [updated] = await app.db
      .update(apiKeys)
      .set({ isActive: !key.isActive })
      .where(eq(apiKeys.id, id))
      .returning({
        id: apiKeys.id,
        isActive: apiKeys.isActive,
      });

    log.info({ keyId: id, isActive: updated.isActive }, 'Admin: API key toggled');

    const response: ApiResponse<{ id: string; isActive: boolean }> = {
      ok: true,
      data: { id: updated.id, isActive: updated.isActive },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // DELETE /admin/api-keys/:id
  app.delete('/api-keys/:id', async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('admin', traceId);
    const { id } = request.params as { id: string };

    const [key] = await app.db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (!key) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    await app.db.delete(apiKeys).where(eq(apiKeys.id, id));

    log.info({ keyId: id }, 'Admin: API key deleted');

    const response: ApiResponse<{ deleted: boolean }> = {
      ok: true,
      data: { deleted: true },
      traceId,
    };
    return reply.code(200).send(response);
  });
};
