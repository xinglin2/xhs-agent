'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { Post, PostStatus } from '@/types';
import { PostCard } from '@/components/PostCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const TABS: { value: PostStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'failed', label: '失败' },
];

const PAGE_SIZE = 10;

interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  pageSize: number;
}

function PostCardSkeleton() {
  return (
    <div className="card-xhs p-4 space-y-2">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
      <div className="flex items-center justify-between mt-3">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PostStatus | 'all'>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: PAGE_SIZE };
      if (activeTab !== 'all') params.status = activeTab;

      const data = await apiGet<PostsResponse>('/posts', params);
      setPosts(data.posts ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setPosts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold text-xhs-dark">内容历史</h1>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-xhs-gray rounded-xhs p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveTab(tab.value);
              setPage(1);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === tab.value
                ? 'bg-white text-xhs-dark shadow-sm'
                : 'text-xhs-muted hover:text-xhs-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="card-xhs p-12 text-center text-xhs-muted">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">暂无内容</p>
          <p className="text-sm mt-1">
            {activeTab === 'all' ? '还没有创作任何内容' : `没有「${TABS.find(t => t.value === activeTab)?.label}」状态的内容`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onAction={(action, id) => {
                if (action === 'edit') router.push(`/create?postId=${id}`);
                if (action === 'republish') {
                  // Trigger republish
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm text-xhs-muted">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
