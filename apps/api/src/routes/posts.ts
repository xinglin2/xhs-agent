import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { posts, images } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import { getSignedUrl } from '../lib/r2.js';
import type { ApiResponse, Post, Image } from '@xhs/shared';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const PostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['draft', 'published', 'failed']).optional(),
});

const UpdatePostSchema = z.object({
  generatedTitle: z.string().max(50).optional(),
  generatedBody: z.string().max(2000).optional(),
  generatedHashtags: z.array(z.string()).max(8).optional(),
  generatedCategoryTags: z.array(z.string()).max(4).optional(),
  notes: z.string().max(500).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enrichImagesWithUrls(
  imageRows: typeof images.$inferSelect[],
): Promise<Image[]> {
  return Promise.all(
    imageRows.map(async (img) => {
      const originalUrl = await getSignedUrl(img.originalR2Key).catch(() => undefined);
      const processedUrl = img.processedR2Key
        ? await getSignedUrl(img.processedR2Key).catch(() => undefined)
        : undefined;

      return {
        id: img.id,
        postId: img.postId,
        originalR2Key: img.originalR2Key,
        processedR2Key: img.processedR2Key ?? null,
        ratio: img.ratio,
        filterApplied: img.filterApplied,
        orderIndex: img.orderIndex,
        originalUrl,
        processedUrl,
      };
    }),
  );
}

function toApiPost(
  p: typeof posts.$inferSelect,
  postImages?: Image[],
): Post {
  return {
    id: p.id,
    userId: p.userId,
    inputText: p.inputText,
    inputLanguage: p.inputLanguage,
    category: p.category as Post['category'],
    tone: p.tone as Post['tone'],
    generatedTitle: p.generatedTitle ?? null,
    generatedBody: p.generatedBody ?? null,
    generatedHashtags: p.generatedHashtags ?? [],
    generatedCategoryTags: p.generatedCategoryTags ?? [],
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    generationModel: p.generationModel ?? null,
    generationTokens: p.generationTokens ?? null,
    images: postImages,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const postsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/posts — paginated list for current user
  app.get('/posts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('posts', traceId);
    const userId = request.user.id;

    const parsed = PostsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      const response: ApiResponse<never> = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Invalid query parameters',
        },
        traceId,
      };
      return reply.code(400).send(response);
    }

    const { page, limit, status } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [eq(posts.userId, userId)];
    if (status) {
      conditions.push(eq(posts.status, status));
    }

    const whereClause = and(...conditions);

    const [postRows, countRows] = await Promise.all([
      app.db
        .select()
        .from(posts)
        .where(whereClause)
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset(offset),
      app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    log.debug({ userId, page, limit, total }, 'Posts fetched');

    const apiPosts = postRows.map((p) => toApiPost(p));

    const response: ApiResponse<{ posts: Post[]; total: number; page: number; pages: number }> = {
      ok: true,
      data: {
        posts: apiPosts,
        total,
        page,
        pages: Math.ceil(total / limit),
      },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // GET /api/posts/:id — single post with images
  app.get('/posts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const userId = request.user.id;
    const { id } = request.params as { id: string };

    const [post] = await app.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .limit(1);

    if (!post) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Post not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    const imageRows = await app.db
      .select()
      .from(images)
      .where(eq(images.postId, id))
      .orderBy(images.orderIndex);

    const enrichedImages = await enrichImagesWithUrls(imageRows);

    const response: ApiResponse<Post> = {
      ok: true,
      data: toApiPost(post, enrichedImages),
      traceId,
    };
    return reply.code(200).send(response);
  });

  // PUT /api/posts/:id — update generated content
  app.put('/posts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('posts', traceId);
    const userId = request.user.id;
    const { id } = request.params as { id: string };

    const parsed = UpdatePostSchema.safeParse(request.body);
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

    // Verify ownership
    const [existing] = await app.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .limit(1);

    if (!existing) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Post not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    const updateData: Partial<typeof posts.$inferInsert> = {
      updatedAt: new Date(),
      ...parsed.data,
    };

    const [updated] = await app.db
      .update(posts)
      .set(updateData)
      .where(eq(posts.id, id))
      .returning();

    log.info({ postId: id, userId }, 'Post updated');

    const response: ApiResponse<Post> = {
      ok: true,
      data: toApiPost(updated),
      traceId,
    };
    return reply.code(200).send(response);
  });

  // DELETE /api/posts/:id — soft delete
  app.delete('/posts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('posts', traceId);
    const userId = request.user.id;
    const { id } = request.params as { id: string };

    // Verify ownership
    const [existing] = await app.db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .limit(1);

    if (!existing) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Post not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    // Soft delete: mark as failed with a note
    await app.db
      .update(posts)
      .set({
        status: 'failed',
        notes: 'Deleted by user',
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id));

    log.info({ postId: id, userId }, 'Post soft-deleted');

    const response: ApiResponse<{ deleted: boolean }> = {
      ok: true,
      data: { deleted: true },
      traceId,
    };
    return reply.code(200).send(response);
  });
};
