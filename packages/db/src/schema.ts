import {
  pgTable, pgEnum, uuid, text, timestamp, integer,
  boolean, index, real
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const postStatusEnum   = pgEnum('post_status',   ['draft', 'published', 'failed']);
export const publishModeEnum  = pgEnum('publish_mode',  ['clipboard', 'auto', 'both']);
export const jobStatusEnum    = pgEnum('job_status',    ['queued', 'running', 'succeeded', 'failed']);
export const llmProviderEnum  = pgEnum('llm_provider',  ['openai', 'qwen']);
export const actionTypeEnum   = pgEnum('action_type',   [
  'generate_content', 'process_image', 'publish_clipboard',
  'publish_auto', 'xhs_link', 'xhs_validate',
]);
export const imageRatioEnum   = pgEnum('image_ratio',   ['1:1', '3:4', '4:3', '9:16', '16:9']);
export const imageFilterEnum  = pgEnum('image_filter',  ['warm', 'cool', 'matte', 'vivid', 'neutral']);

// ── admin_users ───────────────────────────────────────────────────────────────

export const adminUsers = pgTable('admin_users', {
  id:          uuid('id').primaryKey().defaultRandom(),
  email:       text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// ── users ─────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  email:                  text('email').notNull().unique(),
  passwordHash:           text('password_hash').notNull(),
  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt:             timestamp('disabled_at', { withTimezone: true }),
  // XHS Session (AES-256-GCM encrypted JSON blob)
  xhsSessionCookie:       text('xhs_session_cookie'),
  xhsSessionLinkedAt:     timestamp('xhs_session_linked_at', { withTimezone: true }),
  xhsSessionValidatedAt:  timestamp('xhs_session_validated_at', { withTimezone: true }),
  // Consent
  consentAcceptedAt:      timestamp('consent_accepted_at', { withTimezone: true }),
  // Preferences
  publishModePref:        publishModeEnum('publish_mode_pref').notNull().default('clipboard'),
  preferredLlm:           llmProviderEnum('preferred_llm').notNull().default('openai'),
  defaultTone:            text('default_tone').notNull().default('warm'),
  defaultRatio:           imageRatioEnum('default_ratio').notNull().default('3:4'),
  preferredLanguage:      text('preferred_language').notNull().default('zh-CN'),
}, (t) => ({
  emailIdx:      index('idx_users_email').on(t.email),
  createdAtIdx:  index('idx_users_created_at').on(t.createdAt),
}));

// ── posts ─────────────────────────────────────────────────────────────────────

export const posts = pgTable('posts', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  userId:               uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inputText:            text('input_text').notNull(),
  inputLanguage:        text('input_language').notNull().default('en'),
  category:             text('category').notNull().default('travel'),
  tone:                 text('tone').notNull().default('warm'),
  generatedTitle:       text('generated_title'),
  generatedBody:        text('generated_body'),
  generatedHashtags:    text('generated_hashtags').array().notNull().default([]),
  generatedCategoryTags: text('generated_category_tags').array().notNull().default([]),
  status:               postStatusEnum('status').notNull().default('draft'),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt:          timestamp('published_at', { withTimezone: true }),
  generationModel:      text('generation_model'),
  generationTokens:     integer('generation_tokens'),
  notes:                text('notes'),
}, (t) => ({
  userIdIdx:    index('idx_posts_user_id').on(t.userId),
  statusIdx:    index('idx_posts_status').on(t.status),
  createdAtIdx: index('idx_posts_created_at').on(t.createdAt),
}));

// ── images ────────────────────────────────────────────────────────────────────

export const images = pgTable('images', {
  id:               uuid('id').primaryKey().defaultRandom(),
  postId:           uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  originalR2Key:    text('original_r2_key').notNull(),
  processedR2Key:   text('processed_r2_key'),
  ratio:            imageRatioEnum('ratio').notNull().default('3:4'),
  filterApplied:    imageFilterEnum('filter_applied').notNull().default('neutral'),
  orderIndex:       integer('order_index').notNull().default(0),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  postIdIdx: index('idx_images_post_id').on(t.postId),
}));

// ── api_keys ──────────────────────────────────────────────────────────────────

export const apiKeys = pgTable('api_keys', {
  id:           uuid('id').primaryKey().defaultRandom(),
  provider:     llmProviderEnum('provider').notNull(),
  keyEncrypted: text('key_encrypted').notNull(), // AES-256-GCM encrypted
  keyMasked:    text('key_masked').notNull(),    // e.g. "sk-...Ab12" for display
  isActive:     boolean('is_active').notNull().default(true),
  createdBy:    uuid('created_by').references(() => adminUsers.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  providerIdx: index('idx_api_keys_provider').on(t.provider),
}));

// ── usage_logs ────────────────────────────────────────────────────────────────

export const usageLogs = pgTable('usage_logs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType:    actionTypeEnum('action_type').notNull(),
  tokensUsed:    integer('tokens_used'),
  modelUsed:     text('model_used'),
  costEstimate:  real('cost_estimate'), // USD
  traceId:       text('trace_id').notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:    index('idx_usage_logs_user_id').on(t.userId),
  createdAtIdx: index('idx_usage_logs_created_at').on(t.createdAt),
  traceIdIdx:   index('idx_usage_logs_trace_id').on(t.traceId),
}));

// ── publish_jobs ──────────────────────────────────────────────────────────────

export const publishJobs = pgTable('publish_jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  postId:       uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  status:       jobStatusEnum('status').notNull().default('queued'),
  errorMessage: text('error_message'),
  attempts:     integer('attempts').notNull().default(0),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  postIdIdx: index('idx_publish_jobs_post_id').on(t.postId),
  statusIdx: index('idx_publish_jobs_status').on(t.status),
}));
