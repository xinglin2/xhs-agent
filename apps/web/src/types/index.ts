// Types shared with the frontend (mirrors @xhs/shared)

export type PostStatus = 'draft' | 'published' | 'failed' | 'pending';

export interface Post {
  id: string;
  userId: string;
  title: string;
  body: string;
  hashtags: string[];
  imageUrls: string[];
  status: PostStatus;
  category: string;
  tone: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  xhsPostId?: string;
  errorMessage?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPreview: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
  requestCount: number;
}

export interface UsageLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  model?: string;
  tokensUsed?: number;
  cost?: number;
  createdAt: string;
  status: 'success' | 'error';
  traceId?: string;
}

export interface SystemHealth {
  api: 'healthy' | 'degraded' | 'down';
  publisher: 'healthy' | 'degraded' | 'down';
  database: 'healthy' | 'degraded' | 'down';
  uptime: number;
  version: string;
}

export interface DashboardStats {
  totalPosts: number;
  publishedThisWeek: number;
  successRate: number;
  recentPosts: Post[];
}
