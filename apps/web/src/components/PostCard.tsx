import Link from 'next/link';
import { Post, PostStatus } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  post: Post;
  onAction?: (action: 'edit' | 'view' | 'republish', id: string) => void;
}

const STATUS_CONFIG: Record<PostStatus, { label: string; className: string }> = {
  draft: {
    label: '草稿',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  published: {
    label: '已发布',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  failed: {
    label: '失败',
    className: 'bg-red-50 text-red-600 border-red-200',
  },
  pending: {
    label: '发布中',
    className: 'bg-blue-50 text-blue-600 border-blue-200',
  },
};

function formatChineseDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
}

const CATEGORY_LABELS: Record<string, string> = {
  travel: '旅行',
  food: '美食',
  lifestyle: '生活',
  beauty: '美妆',
  fashion: '时尚',
  tech: '科技',
  other: '其他',
};

export function PostCard({ post, onAction }: Props) {
  const statusConfig = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft;
  const title = post.title || '未命名草稿';
  const body = post.body || '';
  const categoryLabel = CATEGORY_LABELS[post.category] ?? post.category;

  const isDraft = post.status === 'draft';
  const actionLabel = isDraft ? '编辑' : '查看详情';
  const actionHref = isDraft ? `/create?postId=${post.id}` : `/history/${post.id}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="p-4 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1 leading-snug">
            {title}
          </h3>

          {/* Status badge */}
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0',
              statusConfig.className,
            )}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category pill */}
          {post.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FFF0F2] text-[#FF2442] text-xs font-medium border border-[#FFD6DC]">
              {categoryLabel}
            </span>
          )}

          {/* Date */}
          <span className="text-xs text-gray-400">
            {formatChineseDate(post.createdAt)}
          </span>
        </div>

        {/* Body preview */}
        {body && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {body}
          </p>
        )}

        {/* Action button */}
        <div className="flex justify-end pt-1">
          <Link
            href={actionHref}
            onClick={() => onAction?.(isDraft ? 'edit' : 'view', post.id)}
            className={cn(
              'inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95',
              isDraft
                ? 'bg-[#FFF0F2] text-[#FF2442] hover:bg-[#FF2442] hover:text-white'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
            )}
          >
            {actionLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
