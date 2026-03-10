import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users, usageLogs } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import { encrypt, decrypt } from '../lib/encryption.js';
import type { ApiResponse } from '@xhs/shared';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const LinkSchema = z.object({
  encryptedCookie: z.string().min(1, 'Encrypted cookie blob is required'),
});

// ── Routes ────────────────────────────────────────────────────────────────────

export const xhsRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/xhs/link
  // Receives an encrypted cookie blob from the publisher service and stores it
  // in the DB (re-encrypted with our AES_KEY).
  app.post('/xhs/link', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('xhs', traceId);
    const userId = request.user.id;

    const parsed = LinkSchema.safeParse(request.body);
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

    const { encryptedCookie } = parsed.data;

    // Decrypt the incoming blob (from publisher service) then re-encrypt with our key
    // The publisher service may send it as plaintext or pre-encrypted depending on
    // integration. We treat it as opaque and store encrypted.
    let cookieToStore: string;
    try {
      // Try to decrypt first (if publisher sent it encrypted)
      cookieToStore = encrypt(decrypt(encryptedCookie));
    } catch {
      // If decryption fails, treat the blob as plaintext and encrypt ourselves
      cookieToStore = encrypt(encryptedCookie);
    }

    const now = new Date();

    await app.db
      .update(users)
      .set({
        xhsSessionCookie: cookieToStore,
        xhsSessionLinkedAt: now,
        xhsSessionValidatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // Log usage
    await app.db.insert(usageLogs).values({
      userId,
      actionType: 'xhs_link',
      traceId,
    });

    log.info({ userId }, 'XHS session linked');

    const response: ApiResponse<{ linked: boolean; linkedAt: string }> = {
      ok: true,
      data: { linked: true, linkedAt: now.toISOString() },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // GET /api/xhs/status
  app.get('/xhs/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const userId = request.user.id;

    const [user] = await app.db
      .select({
        xhsSessionCookie: users.xhsSessionCookie,
        xhsSessionLinkedAt: users.xhsSessionLinkedAt,
        xhsSessionValidatedAt: users.xhsSessionValidatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      const response: ApiResponse<never> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        traceId,
      };
      return reply.code(404).send(response);
    }

    const isLinked = !!user.xhsSessionCookie;

    const response: ApiResponse<{
      isLinked: boolean;
      linkedAt: string | null;
      lastValidatedAt: string | null;
    }> = {
      ok: true,
      data: {
        isLinked,
        linkedAt: user.xhsSessionLinkedAt?.toISOString() ?? null,
        lastValidatedAt: user.xhsSessionValidatedAt?.toISOString() ?? null,
      },
      traceId,
    };
    return reply.code(200).send(response);
  });

  // DELETE /api/xhs/unlink
  app.delete('/xhs/unlink', { preHandler: [app.authenticate] }, async (request, reply) => {
    const traceId = (request as any).traceId as string;
    const { log } = createRequestLogger('xhs', traceId);
    const userId = request.user.id;

    await app.db
      .update(users)
      .set({
        xhsSessionCookie: null,
        xhsSessionLinkedAt: null,
        xhsSessionValidatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    log.info({ userId }, 'XHS session unlinked');

    const response: ApiResponse<{ unlinked: boolean }> = {
      ok: true,
      data: { unlinked: true },
      traceId,
    };
    return reply.code(200).send(response);
  });
};
