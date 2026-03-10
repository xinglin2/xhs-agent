import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { images, posts, usageLogs } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import { uploadFile, downloadFile, deleteFile, getSignedUrl } from '../lib/r2.js';
import type { ApiResponse, ProcessImageResult } from '@xhs/shared';
import type { Sharp } from 'sharp';

// ── Filter presets ────────────────────────────────────────────────────────────

type FilterName = 'warm' | 'cool' | 'matte' | 'vivid' | 'neutral';

const FILTERS: Record<FilterName, (s: Sharp) => Sharp> = {
  warm: (s) =>
    s.modulate({ brightness: 1.05, saturation: 1.1 }).tint({ r: 255, g: 240, b: 220 }),
  cool: (s) =>
    s.modulate({ brightness: 1.02, saturation: 0.95 }).tint({ r: 220, g: 235, b: 255 }),
  matte: (s) => s.modulate({ brightness: 1.0, saturation: 0.75 }).gamma(1.2),
  vivid: (s) => s.modulate({ brightness: 1.05, saturation: 1.35 }).sharpen(),
  neutral: (s) => s.modulate({ brightness: 1.0, saturation: 1.0 }),
};

// ── Ratio dimensions (XHS spec) ───────────────────────────────────────────────

type RatioName = '3:4' | '1:1' | '4:3' | '9:16' | '16:9';

const DIMENSIONS: Record<RatioName, { width: number; height: number }> = {
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};

// ── Allowed MIME types ────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ProcessImageSchema = z.object({
  imageId: z.string().uuid('Invalid image ID'),
  ratio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']),
  filter: z.enum(['warm', 'cool', 'matte', 'vivid', 'neutral']),
  postId: z.string().uuid('Invalid post ID').optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

export const imagesRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/images/upload
  app.post('/images/upload', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('images', traceId);
    const userId = request.user.id;

    const parts = request.parts();
    const imageIds: string[] = [];
    let fileCount = 0;

    // postId may be passed as a form field
    let postId: string | null = null;

    try {
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'postId') {
          postId = part.value as string;
          continue;
        }

        if (part.type !== 'file') continue;

        fileCount++;
        if (fileCount > 9) {
          const response: ApiResponse<never> = {
            ok: false,
            error: { code: 'VALIDATION_ERROR', message: 'Maximum 9 files allowed per upload' },
            traceId,
          };
          return reply.code(400).send(response);
        }

        const mimeType = part.mimetype;
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
          const response: ApiResponse<never> = {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `File type '${mimeType}' is not allowed. Use JPEG, PNG, WebP, or HEIC.`,
            },
            traceId,
          };
          return reply.code(400).send(response);
        }

        // Buffer the file
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        for await (const chunk of part.file) {
          totalBytes += chunk.length;
          if (totalBytes > 10 * 1024 * 1024) {
            const response: ApiResponse<never> = {
              ok: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'File exceeds maximum size of 10MB',
              },
              traceId,
            };
            return reply.code(400).send(response);
          }
          chunks.push(Buffer.from(chunk));
        }

        const buffer = Buffer.concat(chunks);
        const imageId = randomUUID();
        const r2Key = `originals/${userId}/${imageId}`;

        await uploadFile(r2Key, buffer, mimeType);

        // We need a postId to insert into images table. If no postId provided,
        // create a placeholder — or we store just the R2 key and return imageId.
        // Strategy: if postId is provided, insert into images table now.
        // Otherwise, return imageId for later association.
        if (postId) {
          await app.db.insert(images).values({
            id: imageId,
            postId,
            originalR2Key: r2Key,
            ratio: '3:4',
            filterApplied: 'neutral',
            orderIndex: fileCount - 1,
          });
        }

        imageIds.push(imageId);
        log.info({ imageId, bytes: totalBytes, mimeType }, 'Image uploaded to R2');
      }
    } catch (err: any) {
      log.error({ err: err.message }, 'Upload error');
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'STORAGE_ERROR', message: 'Failed to upload image' },
        traceId,
      };
      return reply.code(500).send(response);
    }

    // Log usage
    await app.db.insert(usageLogs).values({
      userId,
      actionType: 'process_image',
      traceId,
    });

    const response: ApiResponse<{ imageIds: string[] }> = {
      ok: true,
      data: { imageIds },
      traceId,
    };
    return reply.code(201).send(response);
  });

  // POST /api/images/process
  app.post('/images/process', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('images', traceId);
    const userId = request.user.id;

    const parsed = ProcessImageSchema.safeParse(request.body);
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

    const { imageId, ratio, filter } = parsed.data;

    // Look up image in DB
    const [image] = await app.db
      .select()
      .from(images)
      .where(eq(images.id, imageId))
      .limit(1);

    if (!image) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Image not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    // Verify ownership via post
    const [post] = await app.db
      .select({ userId: posts.userId })
      .from(posts)
      .where(and(eq(posts.id, image.postId), eq(posts.userId, userId)))
      .limit(1);

    if (!post) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized to process this image' },
        traceId,
      };
      return reply.code(403).send(response);
    }

    try {
      // Download original from R2
      log.info({ imageId, ratio, filter }, 'Starting image processing');
      const originalBuffer = await downloadFile(image.originalR2Key);

      // Get target dimensions
      const dims = DIMENSIONS[ratio as RatioName];

      // Build Sharp pipeline: resize → filter → output JPEG 85%
      let pipeline = sharp(originalBuffer).resize(dims.width, dims.height, {
        fit: 'cover',
        position: 'centre',
      });

      pipeline = FILTERS[filter as FilterName](pipeline);

      const processedBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer();

      // Get metadata for response
      const metadata = await sharp(processedBuffer).metadata();
      const processedR2Key = `processed/${userId}/${imageId}_${ratio.replace(':', 'x')}_${filter}.jpg`;

      await uploadFile(processedR2Key, processedBuffer, 'image/jpeg');

      // Update DB record
      await app.db
        .update(images)
        .set({
          processedR2Key,
          ratio: ratio as any,
          filterApplied: filter as any,
        })
        .where(eq(images.id, imageId));

      const processedUrl = await getSignedUrl(processedR2Key, 3600);

      log.info({ imageId, processedR2Key, bytes: processedBuffer.byteLength }, 'Processing complete');

      const result: ProcessImageResult = {
        imageId,
        processedUrl,
        processedR2Key,
        widthPx: metadata.width ?? dims.width,
        heightPx: metadata.height ?? dims.height,
        sizeBytes: processedBuffer.byteLength,
      };

      const response: ApiResponse<ProcessImageResult> = {
        ok: true,
        data: result,
        traceId,
      };
      return reply.code(200).send(response);
    } catch (err: any) {
      log.error({ err: err.message }, 'Image processing failed');
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'STORAGE_ERROR', message: 'Image processing failed' },
        traceId,
      };
      return reply.code(500).send(response);
    }
  });

  // DELETE /api/images/:id
  app.delete('/images/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('images', traceId);
    const userId = request.user.id;
    const { id: imageId } = request.params as { id: string };

    const [image] = await app.db
      .select()
      .from(images)
      .where(eq(images.id, imageId))
      .limit(1);

    if (!image) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Image not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    // Verify ownership
    const [post] = await app.db
      .select({ userId: posts.userId })
      .from(posts)
      .where(and(eq(posts.id, image.postId), eq(posts.userId, userId)))
      .limit(1);

    if (!post) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized to delete this image' },
        traceId,
      };
      return reply.code(403).send(response);
    }

    try {
      // Delete from R2
      await deleteFile(image.originalR2Key);
      if (image.processedR2Key) {
        await deleteFile(image.processedR2Key).catch(() => {
          /* ignore if already gone */
        });
      }

      // Delete from DB
      await app.db.delete(images).where(eq(images.id, imageId));

      log.info({ imageId }, 'Image deleted');
    } catch (err: any) {
      log.error({ err: err.message }, 'Failed to delete image');
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'STORAGE_ERROR', message: 'Failed to delete image' },
        traceId,
      };
      return reply.code(500).send(response);
    }

    const response: ApiResponse<{ deleted: boolean }> = {
      ok: true,
      data: { deleted: true },
      traceId,
    };
    return reply.code(200).send(response);
  });
};
