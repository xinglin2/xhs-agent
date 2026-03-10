'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useCreateStore, UploadedImage } from '@/store/create';
import { StepIndicator } from '@/components/StepIndicator';
import { ImageGrid } from '@/components/ImageGrid';
import { ArrowLeft, ArrowRight, Camera, Loader2, ImagePlus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const MAX_IMAGES = 9;

const FILTER_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'none', label: '原图', color: '#FFFFFF' },
  { value: 'warm', label: '暖调', color: '#FFD580' },
  { value: 'cool', label: '冷调', color: '#B3E0FF' },
  { value: 'vivid', label: '鲜艳', color: '#FF7EC7' },
  { value: 'fade', label: '淡雅', color: '#E8E8E8' },
];

export default function CreateImagesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    images,
    addImages,
    removeImage,
    reorderImages,
    updateImageRatio,
    updateImageFilter,
    processAllImages,
    isProcessingImages,
  } = useCreateStore();

  const [isDragActive, setIsDragActive] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remaining = MAX_IMAGES - images.length;
      if (remaining === 0) {
        toast({ title: '已达上限', description: '最多上传9张图片', variant: 'destructive' });
        return;
      }
      const toAdd = acceptedFiles.slice(0, remaining);
      if (acceptedFiles.length > remaining) {
        toast({
          title: '部分图片未添加',
          description: `只能再添加 ${remaining} 张图片`,
        });
      }
      addImages(toAdd);
    },
    [images.length, addImages, toast],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: MAX_IMAGES,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    onDropRejected: () => {
      setIsDragActive(false);
      toast({ title: '格式不支持', description: '请上传 JPG、PNG 或 WebP 格式图片', variant: 'destructive' });
    },
  });

  const handleProcessAll = async () => {
    try {
      await processAllImages();
      toast({ title: '图片处理完成', description: '所有图片已处理完毕' });
    } catch {
      toast({ title: '处理失败', description: '部分图片处理失败，请重试', variant: 'destructive' });
    }
  };

  const canContinue = images.length > 0;

  return (
    <div className="flex flex-col min-h-full bg-white max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="px-4 pt-4 pb-2">
        <StepIndicator currentStep={2} />
      </div>

      {/* Back button */}
      <div className="px-4 pb-2">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-xhs-muted hover:text-xhs-dark transition-colors"
        >
          <ArrowLeft size={16} />
          返回编辑内容
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-40 space-y-5">
        {/* Dropzone */}
        {images.length < MAX_IMAGES && (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-xhs p-8 text-center cursor-pointer transition-all duration-200
              ${isDragActive
                ? 'border-xhs-red bg-xhs-pink scale-[1.02]'
                : 'border-gray-200 bg-xhs-gray hover:border-xhs-red hover:bg-xhs-pink/30'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-white rounded-2xl shadow-xhs-card flex items-center justify-center">
                {isDragActive ? (
                  <ImagePlus size={28} className="text-xhs-red" />
                ) : (
                  <Camera size={28} className="text-xhs-muted" />
                )}
              </div>
              <div>
                <p className="font-semibold text-xhs-dark text-sm">
                  {isDragActive ? '松手上传图片' : '点击或拖拽上传图片'}
                </p>
                <p className="text-xs text-xhs-muted mt-1">
                  上传最多9张图片 · 支持 JPG、PNG、WebP
                </p>
                <p className="text-xs text-xhs-muted">
                  已选 {images.length}/{MAX_IMAGES}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Image grid */}
        {images.length > 0 && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-xhs-dark">
                已选图片 ({images.length}/{MAX_IMAGES})
              </h2>
              {images.length < MAX_IMAGES && (
                <button
                  {...(getRootProps() as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                  className="text-xs text-xhs-red hover:underline flex items-center gap-1"
                >
                  <input {...getInputProps()} />
                  <ImagePlus size={12} />
                  添加更多
                </button>
              )}
            </div>

            <ImageGrid
              images={images}
              filterOptions={FILTER_OPTIONS}
              onRemove={removeImage}
              onReorder={reorderImages}
              onRatioChange={updateImageRatio}
              onFilterChange={updateImageFilter}
            />
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 md:relative bg-white border-t border-gray-100 p-4 pb-safe z-10 space-y-3">
        {images.length > 0 && (
          <button
            onClick={handleProcessAll}
            disabled={isProcessingImages}
            className="btn-xhs-ghost w-full h-11 text-sm flex items-center justify-center gap-2"
          >
            {isProcessingImages ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                处理中...
              </>
            ) : (
              '处理所有图片 (应用滤镜&比例)'
            )}
          </button>
        )}

        <button
          onClick={() => {
            useCreateStore.getState().setCurrentStep(3);
            router.push('/create/preview');
          }}
          disabled={!canContinue}
          className="btn-xhs-primary w-full h-12 text-base flex items-center justify-center gap-2"
        >
          {images.length === 0 ? '跳过，直接预览' : '下一步：预览发布'}
          <ArrowRight size={18} />
        </button>

        {images.length === 0 && (
          <button
            onClick={() => {
              useCreateStore.getState().setCurrentStep(3);
              router.push('/create/preview');
            }}
            className="w-full text-center text-xs text-xhs-muted hover:text-xhs-dark transition-colors py-1"
          >
            不需要图片，直接发布文字内容
          </button>
        )}
      </div>
    </div>
  );
}
