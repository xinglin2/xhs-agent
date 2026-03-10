'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { UploadedImage } from '@/store/create';
import { cn } from '@/lib/utils';

const RATIOS: { value: '3:4' | '1:1'; label: string }[] = [
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
];

interface FilterOption {
  value: string;
  label: string;
  color: string;
}

interface Props {
  images: UploadedImage[];
  filterOptions?: FilterOption[];
  onRatioChange: (id: string, ratio: '3:4' | '1:1') => void;
  onFilterChange: (id: string, filter: string) => void;
  onDelete?: (id: string) => void;
  onRemove?: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
}

const DEFAULT_FILTER_OPTIONS: FilterOption[] = [
  { value: 'warm', label: '暖调', color: '#FFB347' },
  { value: 'cool', label: '冷调', color: '#87CEEB' },
  { value: 'matte', label: '哑光', color: '#B0B0B0' },
  { value: 'vivid', label: '鲜艳', color: '#FF69B4' },
  { value: 'neutral', label: '原图', color: '#FFFFFF' },
];

export function ImageGrid({
  images,
  filterOptions,
  onRatioChange,
  onFilterChange,
  onDelete,
  onRemove,
  onReorder,
}: Props) {
  const handleDelete = (id: string) => {
    onDelete?.(id);
    onRemove?.(id);
  };

  const resolvedFilters = filterOptions ?? DEFAULT_FILTER_OPTIONS;

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.map((image, index) => (
        <div key={image.id} className="flex flex-col gap-1.5">
          {/* Thumbnail */}
          <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden group">
            {/* Image */}
            <Image
              src={image.previewUrl}
              alt={`图片 ${index + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 33vw, 150px"
              unoptimized
            />

            {/* Order badge (top-left) */}
            <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs font-bold flex items-center justify-center z-10">
              {index + 1}
            </div>

            {/* Delete button (top-right) */}
            <button
              onClick={() => handleDelete(image.id)}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center z-10 hover:bg-[#FF2442] transition-colors opacity-0 group-hover:opacity-100"
              aria-label="删除图片"
            >
              <X size={11} strokeWidth={3} />
            </button>

            {/* Processing indicator */}
            {!image.isProcessed && image.isUploaded && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Upload progress bar */}
            {image.uploadProgress > 0 && image.uploadProgress < 100 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                <div
                  className="h-full bg-[#FF2442] transition-all duration-200"
                  style={{ width: `${image.uploadProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Ratio selector */}
          <div className="flex gap-1">
            {RATIOS.map((r) => (
              <button
                key={r.value}
                onClick={() => onRatioChange(image.id, r.value)}
                className={cn(
                  'flex-1 py-0.5 rounded text-[10px] font-medium border transition-all duration-100',
                  image.ratio === r.value
                    ? 'bg-[#FF2442] border-[#FF2442] text-white'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-[#FF2442] hover:text-[#FF2442]',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Filter selector (color dots) */}
          <div className="flex gap-1 justify-center">
            {resolvedFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => onFilterChange(image.id, f.value)}
                title={f.label}
                className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all duration-100',
                  f.value === 'neutral' || f.value === 'none'
                    ? 'border-gray-300'
                    : 'border-transparent',
                  image.filter === f.value
                    ? 'ring-2 ring-[#FF2442] ring-offset-1 scale-110'
                    : 'hover:scale-110',
                )}
                style={{ backgroundColor: f.color }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
