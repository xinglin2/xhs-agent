'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateStore, Category, Tone } from '@/store/create';
import { detectLanguage } from '@/lib/utils';
import { StepIndicator } from '@/components/StepIndicator';
import { HashtagEditor } from '@/components/HashtagEditor';
import { Sparkles, ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// ── Constants ──

const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: 'travel', label: '旅行', emoji: '✈️' },
  { value: 'food', label: '美食', emoji: '🍜' },
  { value: 'lifestyle', label: '生活', emoji: '🌿' },
  { value: 'beauty', label: '美妆', emoji: '💄' },
  { value: 'fashion', label: '时尚', emoji: '👗' },
  { value: 'tech', label: '科技', emoji: '💻' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'warm', label: '温暖' },
  { value: 'aspirational', label: '向往' },
  { value: 'educational', label: '干货' },
  { value: 'humorous', label: '搞笑' },
];

// ── Components ──

function SparkleLoader() {
  return (
    <div className="fixed inset-0 bg-white/90 flex flex-col items-center justify-center z-50 animate-fade-in">
      <div className="text-5xl animate-sparkle mb-4">✨</div>
      <p className="text-xhs-dark font-semibold text-lg">AI 正在创作中...</p>
      <p className="text-xhs-muted text-sm mt-1">请稍等几秒钟</p>
      <div className="mt-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-xhs-red animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main page ──

export default function CreatePage() {
  const router = useRouter();
  const { toast } = useToast();

  const {
    inputText,
    inputLanguage,
    category,
    tone,
    generatedContent,
    isGenerating,
    setInputText,
    setInputLanguage,
    setCategory,
    setTone,
    generate,
    updateContent,
    setCurrentStep,
  } = useCreateStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_CHARS = 1000;
  const chars = inputText.length;

  // Auto-detect language as user types
  useEffect(() => {
    if (inputText.length > 10) {
      const detected = detectLanguage(inputText);
      setInputLanguage(detected.code);
    }
  }, [inputText, setInputLanguage]);

  // Language badge
  const langInfo = detectLanguage(inputText);

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      toast({ title: '请先输入内容', description: '在上方文本框描述你想发布的内容', variant: 'destructive' });
      return;
    }
    try {
      await generate();
      setCurrentStep(1);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'AI 生成失败，请重试';
      toast({ title: '生成失败', description: msg, variant: 'destructive' });
    }
  };

  const handleContinue = () => {
    setCurrentStep(2);
    router.push('/create/images');
  };

  const handleRegen = async () => {
    try {
      await generate();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'AI 生成失败，请重试';
      toast({ title: '重新生成失败', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-white max-w-2xl mx-auto">
      {isGenerating && <SparkleLoader />}

      {/* Step indicator */}
      <div className="px-4 pt-4 pb-2">
        <StepIndicator currentStep={1} />
      </div>

      <div className="flex-1 overflow-auto px-4 pb-32 space-y-5">
        {/* Input section */}
        {!generatedContent && (
          <div className="space-y-4 animate-fade-in">
            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value.slice(0, MAX_CHARS))}
                placeholder="用任何语言描述你想发的内容...&#10;（例如：我去了日本京都的金阁寺，景色太美了！）"
                className="input-xhs w-full h-36 resize-none text-sm leading-relaxed"
                rows={6}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {inputText.length > 10 && (
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full border border-gray-200 text-xhs-muted">
                    {langInfo.flag} {langInfo.label}
                  </span>
                )}
                <span className={`text-xs ${chars > MAX_CHARS * 0.9 ? 'text-red-400' : 'text-xhs-muted'}`}>
                  {chars}/{MAX_CHARS}
                </span>
              </div>
            </div>

            {/* Category selector */}
            <div>
              <p className="text-xs font-semibold text-xhs-muted uppercase tracking-wider mb-2">分类</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={`pill-selector ${category === cat.value ? 'pill-selector-active' : 'pill-selector-inactive'}`}
                  >
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone selector */}
            <div>
              <p className="text-xs font-semibold text-xhs-muted uppercase tracking-wider mb-2">风格</p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={`pill-selector ${tone === t.value ? 'pill-selector-active' : 'pill-selector-inactive'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Generated content section */}
        {generatedContent && (
          <div className="space-y-4 animate-slide-up">
            {/* Re-gen hint */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-xhs-dark">✨ 生成结果</p>
              <button
                onClick={handleRegen}
                disabled={isGenerating}
                className="flex items-center gap-1 text-xs text-xhs-muted hover:text-xhs-red transition-colors"
              >
                <RotateCcw size={12} />
                重新生成
              </button>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-xhs-muted uppercase tracking-wider">标题</label>
                <span className={`text-xs ${generatedContent.title.length > 18 ? 'text-red-400' : 'text-xhs-muted'}`}>
                  {generatedContent.title.length}/20
                </span>
              </div>
              <input
                type="text"
                value={generatedContent.title}
                onChange={(e) => updateContent({ title: e.target.value.slice(0, 20) })}
                className="input-xhs w-full text-sm font-medium"
                placeholder="标题"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-semibold text-xhs-muted uppercase tracking-wider block mb-1">正文</label>
              <textarea
                value={generatedContent.body}
                onChange={(e) => updateContent({ body: e.target.value })}
                className="input-xhs w-full text-sm leading-relaxed resize-none"
                rows={8}
              />
            </div>

            {/* Hashtags */}
            <div>
              <label className="text-xs font-semibold text-xhs-muted uppercase tracking-wider block mb-2">话题标签</label>
              <HashtagEditor
                hashtags={generatedContent.hashtags}
                onChange={(hashtags) => updateContent({ hashtags })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 md:relative bg-white border-t border-gray-100 p-4 pb-safe z-10">
        {!generatedContent ? (
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !inputText.trim()}
            className="btn-xhs-primary w-full h-14 text-base flex items-center justify-center gap-2 shadow-xhs"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                AI 正在创作中...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                ✨ 生成小红书内容
              </>
            )}
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => useCreateStore.getState().reset()}
              className="btn-xhs-ghost flex-1 h-12 text-sm"
            >
              重新开始
            </button>
            <button
              onClick={handleContinue}
              className="btn-xhs-primary flex-[2] h-12 text-sm flex items-center justify-center gap-1"
            >
              继续添加图片
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
