import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createDb } from '@xhs/db';
import type { Db } from '@xhs/db';
import { createLogger } from '@xhs/logger';

const log = createLogger('db-plugin');

// ── Augment Fastify types ────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const dbPluginImpl: FastifyPluginAsync = async (app) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  log.info('Connecting to database...');
  const db = createDb(connectionString);

  app.decorate('db', db);

  app.addHook('onClose', async () => {
    log.info('Closing database connection...');
    // postgres-js connections are managed per-query; the pool closes naturally.
  });

  log.info('Database plugin registered');
};

export const dbPlugin = fp(dbPluginImpl, {
  name: 'db-plugin',
});
