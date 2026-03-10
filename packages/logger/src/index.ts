import pino from 'pino';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// @xhs/logger — Structured JSON logger with trace ID propagation
// Usage:
//   import { createLogger } from '@xhs/logger';
//   const log = createLogger('api');
//   log.info({ traceId, userId }, 'Request received');
// ─────────────────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
  base: {
    env: process.env.NODE_ENV ?? 'development',
  },
  redact: {
    // Never log sensitive fields
    paths: [
      'password', 'password_hash', 'passwordHash',
      'xhs_session_cookie', 'xhsSessionCookie',
      'key', 'apiKey', 'api_key',
      'accessToken', 'refreshToken',
      'authorization', 'cookie',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = pino.Logger;

/**
 * Create a child logger scoped to a service name.
 * @param service - e.g. 'api', 'publisher', 'image-processor'
 */
export function createLogger(service: string): pino.Logger {
  return baseLogger.child({ service });
}

/**
 * Generate a new trace ID for a request.
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Create a request-scoped logger with trace ID already bound.
 */
export function createRequestLogger(service: string, traceId?: string): {
  log: pino.Logger;
  traceId: string;
} {
  const id = traceId ?? generateTraceId();
  return {
    log: createLogger(service).child({ traceId: id }),
    traceId: id,
  };
}

export { pino };
