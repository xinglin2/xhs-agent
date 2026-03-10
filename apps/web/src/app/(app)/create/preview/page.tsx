'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateStore } from '@/store/create';
import { useAuthStore } from '@/store/auth';
import { StepIndicator } from '@/components/StepIndicator';
import { XhsPreview } from '@/components/XhsPreview';
import { ConsentModal } from '@/components/ConsentModal';
import { copyToClipboard } from '@/lib/utils';
import { apiPost } from '@/lib/api';
import { ArrowLeft, Copy, Rocket, Link2, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function CreatePreviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { generatedContent, images, postId, reset } = useCreateStore();
  const { user } = useAuthStore();

  const [showConsent, setShowConsent] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const xhsLinked = user?.xhsLinked ?? false;

  // Redirect if no content
  if (!generatedContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
        <p className="text-xhs-muted mb-4">暂无内容，请先生成内容</p>
        <button onClick={() => router.push('/create')} className="btn-xhs-primary px-6 py-2">
          开始创作
        </button>
      </div>
    );
  }

  const handleCopy = async () => {
    const { title, body, hashtags } = generatedContent;
    const text = [
      title,
      '',
      body,
      '',
      hashtags.map((t) => `#${t}`).join(' '),
    ].join('\n');

    try {
      await copyToClipboard(text);
      setCopySuccess(true);
      toast({ title: '📋 复制成功！', description: '内容已复制到剪贴板' });
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      toast({ title: '复制失败', description: '请手动选择内容复制', variant: 'destructive' });
    }
  };

  const handlePublishClick = () => {
    if (!xhsLinked) return;
    // Check consent
    const hasConsented = localStorage.getItem('xhs_publish_consent') === 'true';
    if (!hasConsented) {
      setShowConsent(true);
    } else {
      doPublish();
    }
  };

  const doPublish = async () => {
    setIsPublishing(true);
    try {
      await apiPost('/posts/publish', {
        postId,
        title: generatedContent.title,
        body: generatedContent.body,
        hashtags: generatedContent.hashtags,
        imageUrls: images
          .filter((i) => i.processedUrl ?? i.uploadedUrl)
          .map((i) => i.processedUrl ?? i.uploadedUrl),
      });
      toast({
        title: '🎉 发布成功！',
        description: '你的内容已成功发布到小红书',
      });
      reset();
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '发布失败，请稍后重试';
      toast({ title: '发布失败', description: msg, variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  };

  const imageUrls = images
    .map((i) => i.processedUrl ?? i.uploadedUrl ?? i.previewUrl)
    .filter(Boolean) as string[];

  return (
    <div className="flex flex-col min-h-full bg-white max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="px-4 pt-4 pb-2">
        <StepIndicator currentStep={3} />
      </div>

      {/* Back */}
      <div className="px-4 pb-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-xhs-muted hover:text-xhs-dark transition-colors"
        >
          <ArrowLeft size={16} />
          返回图片编辑
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-48 animate-fade-in">
        <h2 className="text-sm font-semibold text-xhs-muted mb-3 uppercase tracking-wider">预览效果</h2>

        {/* XHS Preview Card */}
        <XhsPreview
          title={generatedContent.title}
          body={generatedContent.body}
          hashtags={generatedContent.hashtags}
          imageUrls={imageUrls}
        />
      </div>

      {/* Action buttons */}
      <div className="fixed bottom-0 left-0 right-0 md:relative bg-white border-t border-gray-100 p-4 pb-safe z-10 space-y-3">
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={`w-full h-12 rounded-xhs text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 border ${
            copySuccess
              ? 'bg-green-50 border-green-400 text-green-700'
              : 'bg-white border-gray-200 text-xhs-dark hover:border-xhs-red hover:text-xhs-red'
          }`}
        >
          {copySuccess ? (
            <>
              <CheckCircle2 size={18} className="text-green-600" />
              已复制到剪贴板
            </>
          ) : (
            <>
              <Copy size={18} />
              📋 复制文案
            </>
          )}
        </button>

        {/* Publish button or link warning */}
        {xhsLinked ? (
          <button
            onClick={handlePublishClick}
            disabled={isPublishing}
            className="btn-xhs-primary w-full h-14 text-base flex items-center justify-center gap-2 shadow-xhs"
          >
            {isPublishing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                正在发布到小红书...
              </>
            ) : (
              <>
                <Rocket size={20} />
                🚀 一键发布到小红书
              </>
            )}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded-xhs px-4 py-3 flex items-start gap-2">
              <Link2 size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                请先连接小红书账号才能一键发布
              </p>
            </div>
            <Link
              href="/settings/xhs"
              className="btn-xhs-primary w-full h-12 text-sm flex items-center justify-center gap-2"
            >
              <Link2 size={16} />
              前往连接小红书账号
            </Link>
          </div>
        )}
      </div>

      {/* Consent modal */}
      {showConsent && (
        <ConsentModal
          onConfirm={() => {
            localStorage.setItem('xhs_publish_consent', 'true');
            setShowConsent(false);
            doPublish();
          }}
          onCancel={() => setShowConsent(false)}
        />
      )}
    </div>
  );
}
