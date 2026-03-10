import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, LinkIcon, CheckCircle2, XCircle } from 'lucide-react';
import { Post, DashboardStats } from '@/types';

// ── Skeleton components ──

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card-xhs p-4">
          <div className="skeleton h-6 w-12 mb-1" />
          <div className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function PostListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card-xhs p-4">
          <div className="skeleton h-4 w-3/4 mb-2" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── Stats row ──

async function StatsRow() {
  // In production this would be a server-side fetch
  const stats: DashboardStats = {
    totalPosts: 0,
    publishedThisWeek: 0,
    successRate: 0,
    recentPosts: [],
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card-xhs p-4 text-center">
        <div className="text-2xl font-bold text-xhs-dark">{stats.totalPosts}</div>
        <div className="text-xs text-xhs-muted mt-0.5">总内容数</div>
      </div>
      <div className="card-xhs p-4 text-center">
        <div className="text-2xl font-bold text-xhs-dark">{stats.publishedThisWeek}</div>
        <div className="text-xs text-xhs-muted mt-0.5">本周发布</div>
      </div>
      <div className="card-xhs p-4 text-center">
        <div className="text-2xl font-bold text-xhs-dark">
          {stats.successRate > 0 ? `${stats.successRate}%` : '--'}
        </div>
        <div className="text-xs text-xhs-muted mt-0.5">成功率</div>
      </div>
    </div>
  );
}

// ── Post status badge ──

const statusMap: Record<Post['status'], { label: string; className: string }> = {
  draft: { label: '草稿', className: 'status-badge status-draft' },
  published: { label: '已发布', className: 'status-badge status-published' },
  failed: { label: '失败', className: 'status-badge status-failed' },
  pending: { label: '发布中', className: 'status-badge status-pending' },
};

// ── Recent posts ──

async function RecentPosts() {
  const posts: Post[] = []; // Would fetch from API

  if (posts.length === 0) {
    return (
      <div className="card-xhs p-8 text-center text-xhs-muted">
        <p className="text-sm">暂无内容，点击上方按钮开始创作吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => {
        const s = statusMap[post.status];
        return (
          <div key={post.id} className="card-xhs p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-xhs-dark truncate">{post.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={s.className}>{s.label}</span>
                <span className="text-xs text-xhs-muted">
                  {new Date(post.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
            <Link
              href={post.status === 'draft' ? `/create?postId=${post.id}` : `/history`}
              className="flex-shrink-0 text-xs text-xhs-red hover:underline"
            >
              {post.status === 'draft' ? '继续编辑' : '查看'}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// ── XHS Status widget ──

function XhsStatusWidget({ linked }: { linked: boolean }) {
  return (
    <div className="card-xhs p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${linked ? 'bg-green-100' : 'bg-gray-100'}`}>
          {linked ? (
            <CheckCircle2 size={18} className="text-green-600" />
          ) : (
            <XCircle size={18} className="text-gray-400" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">小红书账号</p>
          <p className="text-xs text-xhs-muted">{linked ? '已连接 ✓' : '未连接'}</p>
        </div>
      </div>
      <Link
        href="/settings/xhs"
        className="text-xs text-xhs-red hover:underline flex items-center gap-1"
      >
        <LinkIcon size={12} />
        {linked ? '管理' : '立即连接'}
      </Link>
    </div>
  );
}

// ── Dashboard page ──

export default function DashboardPage() {
  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto animate-fade-in">
      {/* Welcome */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-xhs-dark">
          你好 👋
        </h1>
        <p className="text-xhs-muted text-sm mt-1">今天想创作什么内容？</p>
      </div>

      {/* Stats */}
      <section>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsRow />
        </Suspense>
      </section>

      {/* New post CTA */}
      <Link
        href="/create"
        className="btn-xhs-primary w-full h-14 text-base flex items-center justify-center gap-2 shadow-xhs animate-pulse-red"
      >
        <Plus size={20} />
        新建内容
      </Link>

      {/* XHS status */}
      <section>
        <XhsStatusWidget linked={false} />
      </section>

      {/* Recent posts */}
      <section>
        <h2 className="text-base font-semibold text-xhs-dark mb-3">最近内容</h2>
        <Suspense fallback={<PostListSkeleton />}>
          <RecentPosts />
        </Suspense>
      </section>
    </div>
  );
}
