import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { posts, images, publishJobs, usageLogs } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import { getSignedUrl } from '../lib/r2.js';
import type {
  ApiResponse,
  ClipboardPublishResult,
  AutoPublishResult,
  PublishJob,
} from '@xhs/shared';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ClipboardPublishSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
});

const AutoPublishSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the auto-publish consent' }),
  }),
});

// ── Clipboard formatting ──────────────────────────────────────────────────────

function formatForClipboard(
  title: string,
  body: string,
  hashtags: string[],
): string {
  const hashtagLine = hashtags.map((tag) => `#${tag}`).join(' ');
  return `${title}\n\n${body}\n\n${hashtagLine}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const publishRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/publish/clipboard
  app.post(
    '/publish/clipboard',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const traceId = (request as any).traceId as string;
      const { log } = createRequestLogger('publish', traceId);
      const userId = request.user.id;

      const parsed = ClipboardPublishSchema.safeParse(request.body);
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

      const { postId } = parsed.data;

      // Fetch post
      const [post] = await app.db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);

      if (!post) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Post not found' },
          traceId,
        };
        return reply.code(404).send(response);
      }

      if (!post.generatedTitle || !post.generatedBody) {
        const response: ApiResponse<never> = {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Post has no generated content yet',
          },
          traceId,
        };
        return reply.code(422).send(response);
      }

      // Fetch processed images ordered
      const imageRows = await app.db
        .select()
        .from(images)
        .where(eq(images.postId, postId))
        .orderBy(images.orderIndex);

      // Get signed URLs for processed images
      const imageUrls = await Promise.all(
        imageRows.map(async (img) => {
          const key = img.processedR2Key ?? img.originalR2Key;
          return getSignedUrl(key, 3600).catch(() => '');
        }),
      );

      const formattedText = formatForClipboard(
        post.generatedTitle,
        post.generatedBody,
        post.generatedHashtags ?? [],
      );

      // Mark post as published (clipboard mode)
      await app.db
        .update(posts)
        .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, postId));

      // Log usage
      await app.db.insert(usageLogs).values({
        userId,
        actionType: 'publish_clipboard',
        traceId,
      });

      log.info({ postId, userId }, 'Post formatted for clipboard');

      const result: ClipboardPublishResult = {
        formattedText,
        imageUrls: imageUrls.filter(Boolean),
      };

      const response: ApiResponse<ClipboardPublishResult> = {
        ok: true,
        data: result,
        traceId,
      };
      return reply.code(200).send(response);
    },
  );

  // POST /api/publish/auto
  app.post(
    '/publish/auto',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const traceId = (request as any).traceId as string;
      const { log } = createRequestLogger('publish', traceId);
      const userId = request.user.id;

      const parsed = AutoPublishSchema.safeParse(request.body);
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

      const { postId } = parsed.data;

      // Fetch post
      const [post] = await app.db
        .select()
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
        .limit(1);

      if (!post) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Post not found' },
          traceId,
        };
        return reply.code(404).send(response);
      }

      if (!post.generatedTitle || !post.generatedBody) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Post has no generated content' },
          traceId,
        };
        return reply.code(422).send(response);
      }

      // Create publish job in DB
      const [job] = await app.db
        .insert(publishJobs)
        .values({ postId, status: 'queued' })
        .returning();

      // Enqueue BullMQ job
      await app.publishQueue.add(
        'publish-post',
        {
          jobId: job.id,
          postId,
          userId,
          traceId,
        },
        { jobId: job.id },
      );

      // Log usage
      await app.db.insert(usageLogs).values({
        userId,
        actionType: 'publish_auto',
        traceId,
      });

      log.info({ postId, jobId: job.id, userId }, 'Auto-publish job enqueued');

      const result: AutoPublishResult = {
        jobId: job.id,
        status: 'queued',
      };

      const response: ApiResponse<AutoPublishResult> = {
        ok: true,
        data: result,
        traceId,
      };
      return reply.code(202).send(response);
    },
  );

  // GET /api/publish/status/:jobId
  app.get(
    '/publish/status/:jobId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const traceId = (request as any).traceId as string;
      const { log } = createRequestLogger('publish', traceId);
      const userId = request.user.id;
      const { jobId } = request.params as { jobId: string };

      // Fetch job and verify user owns the associated post
      const [jobRow] = await app.db
        .select({
          id: publishJobs.id,
          postId: publishJobs.postId,
          status: publishJobs.status,
          errorMessage: publishJobs.errorMessage,
          attempts: publishJobs.attempts,
          createdAt: publishJobs.createdAt,
          completedAt: publishJobs.completedAt,
          postUserId: posts.userId,
        })
        .from(publishJobs)
        .innerJoin(posts, eq(posts.id, publishJobs.postId))
        .where(eq(publishJobs.id, jobId))
        .limit(1);

      if (!jobRow) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Publish job not found' },
          traceId,
        };
        return reply.code(404).send(response);
      }

      if (jobRow.postUserId !== userId) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authorized to view this job' },
          traceId,
        };
        return reply.code(403).send(response);
      }

      log.debug({ jobId, status: jobRow.status }, 'Job status fetched');

      const publishJob: PublishJob = {
        id: jobRow.id,
        postId: jobRow.postId,
        status: jobRow.status,
        errorMessage: jobRow.errorMessage ?? null,
        attempts: jobRow.attempts,
        createdAt: jobRow.createdAt.toISOString(),
        completedAt: jobRow.completedAt?.toISOString() ?? null,
      };

      const response: ApiResponse<PublishJob> = {
        ok: true,
        data: publishJob,
        traceId,
      };
      return reply.code(200).send(response);
    },
  );
};
