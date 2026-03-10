import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { createLogger } from '@xhs/logger';

const log = createLogger('redis-plugin');

// ── Augment Fastify types ────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    publishQueue: Queue;
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const redisPluginImpl: FastifyPluginAsync = async (app) => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  log.info('Connecting to Redis...');

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  redis.on('connect', () => log.info('Redis connected'));
  redis.on('error', (err) => log.error({ err }, 'Redis error'));

  // BullMQ publish queue — pass raw connection options object
  const publishQueue = new Queue('publish', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: { url: redisUrl, maxRetriesPerRequest: null, enableReadyCheck: false } as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  app.decorate('redis', redis);
  app.decorate('publishQueue', publishQueue);

  app.addHook('onClose', async () => {
    log.info('Closing Redis connections...');
    await publishQueue.close();
    await redis.quit();
  });

  log.info('Redis plugin registered');
};

export const redisPlugin = fp(redisPluginImpl, {
  name: 'redis-plugin',
});
