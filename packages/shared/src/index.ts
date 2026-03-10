// ─────────────────────────────────────────────────────────────────────────────
// @xhs/shared — All TypeScript types shared between web and api
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'published' | 'failed';
export type PublishMode = 'clipboard' | 'auto' | 'both';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type LlmProvider = 'openai' | 'qwen';
export type ActionType =
  | 'generate_content'
  | 'process_image'
  | 'publish_clipboard'
  | 'publish_auto'
  | 'xhs_link'
  | 'xhs_validate';
export type ImageRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageFilter = 'warm' | 'cool' | 'matte' | 'vivid' | 'neutral';
export type PostCategory = 'travel' | 'food' | 'lifestyle' | 'beauty' | 'fashion' | 'tech' | 'other';
export type PostTone = 'warm' | 'aspirational' | 'informative' | 'funny';

// ── User ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  createdAt: string;
  disabledAt: string | null;
  xhsSessionLinkedAt: string | null;
  xhsSessionValidatedAt: string | null;
  consentAcceptedAt: string | null;
  publishModePref: PublishMode;
  preferredLlm: LlmProvider;
  defaultTone: PostTone;
  defaultRatio: ImageRatio;
  preferredLanguage: string;
}

// ── Post ──────────────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  userId: string;
  inputText: string;
  inputLanguage: string;
  category: PostCategory;
  tone: PostTone;
  generatedTitle: string | null;
  generatedBody: string | null;
  generatedHashtags: string[];
  generatedCategoryTags: string[];
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  generationModel: string | null;
  generationTokens: number | null;
  images?: Image[];
}

// ── Image ─────────────────────────────────────────────────────────────────────

export interface Image {
  id: string;
  postId: string;
  originalR2Key: string;
  processedR2Key: string | null;
  ratio: ImageRatio;
  filterApplied: ImageFilter;
  orderIndex: number;
  originalUrl?: string;
  processedUrl?: string;
}

// ── Publish Job ───────────────────────────────────────────────────────────────

export interface PublishJob {
  id: string;
  postId: string;
  status: JobStatus;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  completedAt: string | null;
}

// ── API Key ───────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  provider: LlmProvider;
  keyMasked: string;   // e.g. "sk-...Abc1" — never full key on client
  isActive: boolean;
  createdAt: string;
}

// ── Usage Log ─────────────────────────────────────────────────────────────────

export interface UsageLog {
  id: string;
  userId: string;
  actionType: ActionType;
  tokensUsed: number | null;
  modelUsed: string | null;
  costEstimate: number | null; // USD
  createdAt: string;
  traceId: string;
}

// ── LLM Generation ────────────────────────────────────────────────────────────

export interface GenerateRequest {
  inputText: string;           // max 1000 chars
  inputLanguage?: string;      // ISO 639-1, auto-detected if omitted
  category: PostCategory;
  tone: PostTone;
}

export interface GeneratedContent {
  title: string;               // max 20 chars
  body: string;                // XHS-formatted with emojis and line breaks
  hashtags: string[];          // e.g. ["旅行", "美食日记"]
  categoryTags: string[];
  toneCheck: PostTone;
  model: string;
  tokensUsed: number;
}

// ── Image Processing ──────────────────────────────────────────────────────────

export interface ProcessImageRequest {
  imageId: string;
  ratio: ImageRatio;
  filter: ImageFilter;
}

export interface ProcessImageResult {
  imageId: string;
  processedUrl: string;
  processedR2Key: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
}

// ── Publish ───────────────────────────────────────────────────────────────────

export interface ClipboardPublishResult {
  formattedText: string;       // title + body + hashtags formatted for clipboard
  imageUrls: string[];         // ordered processed image URLs
}

export interface AutoPublishResult {
  jobId: string;
  status: JobStatus;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  activeUsers24h: number;
  totalPostsToday: number;
  publishSuccessRate: number;  // 0–1
  estimatedCostToday: number;  // USD
}

// ── API Response wrappers ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  traceId: string;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    field?: string;             // for validation errors
  };
  traceId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;         // JWT, 15min expiry
  refreshToken: string;        // opaque, 7d expiry
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}
