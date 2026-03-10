'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Heart, MessageCircle, Bookmark, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  body: string;
  hashtags: string[];
  imageUrls: string[];
}

export function XhsPreview({ title, body, hashtags, imageUrls }: Props) {
  const [currentImage, setCurrentImage] = useState(0);

  const hasImages = imageUrls.length > 0;
  const hasMultipleImages = imageUrls.length > 1;

  const prevImage = () => setCurrentImage((i) => Math.max(0, i - 1));
  const nextImage = () => setCurrentImage((i) => Math.min(imageUrls.length - 1, i + 1));

  return (
    <div className="w-full max-w-[375px] mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Image carousel */}
      {hasImages ? (
        <div className="relative bg-gray-100 aspect-[3/4] overflow-hidden">
          {/* Images */}
          <div
            className="flex h-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${currentImage * 100}%)` }}
          >
            {imageUrls.map((url, i) => (
              <div key={i} className="relative w-full h-full flex-shrink-0">
                <Image
                  src={url}
                  alt={`图片 ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="375px"
                  unoptimized
                />
              </div>
            ))}
          </div>

          {/* Navigation arrows */}
          {hasMultipleImages && (
            <>
              {currentImage > 0 && (
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              {currentImage < imageUrls.length - 1 && (
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </>
          )}

          {/* Dot indicator */}
          {hasMultipleImages && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {imageUrls.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImage(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200',
                    i === currentImage
                      ? 'w-4 bg-white'
                      : 'w-1.5 bg-white/60',
                  )}
                />
              ))}
            </div>
          )}

          {/* Image count badge */}
          {hasMultipleImages && (
            <div className="absolute top-3 right-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
              {currentImage + 1}/{imageUrls.length}
            </div>
          )}
        </div>
      ) : (
        /* No image placeholder */
        <div className="aspect-[3/4] bg-gradient-to-br from-[#FFF0F2] to-[#FFE0E6] flex items-center justify-center">
          <div className="text-center">
            <p className="text-4xl mb-2">📝</p>
            <p className="text-xs text-[#FF2442]/60">纯文字笔记</p>
          </div>
        </div>
      )}

      {/* Post content */}
      <div className="p-4 space-y-3">
        {/* User row */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#FF2442] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            你
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-800">你</span>
            <div className="w-5 h-5 bg-[#FF2442] rounded-sm flex items-center justify-center">
              <span className="text-white text-[8px] font-bold leading-none">小</span>
            </div>
          </div>
          <div className="ml-auto">
            <button className="text-xs bg-[#FF2442] text-white px-3 py-1 rounded-full font-medium hover:bg-red-500 transition-colors">
              关注
            </button>
          </div>
        </div>

        {/* Title */}
        {title && (
          <h2 className="text-lg font-bold text-gray-900 leading-snug">
            {title}
          </h2>
        )}

        {/* Body */}
        {body && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {body}
          </p>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.map((tag, i) => (
              <span key={i} className="text-sm text-[#FF2442] font-medium">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 pt-2" />

        {/* Action bar */}
        <div className="flex items-center justify-between text-gray-400">
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1 hover:text-[#FF2442] transition-colors group">
              <Heart size={20} strokeWidth={1.5} className="group-hover:fill-[#FF2442] group-hover:stroke-[#FF2442] transition-all" />
              <span className="text-xs">1.2k</span>
            </button>
            <button className="flex items-center gap-1 hover:text-gray-600 transition-colors">
              <MessageCircle size={20} strokeWidth={1.5} />
              <span className="text-xs">48</span>
            </button>
            <button className="flex items-center gap-1 hover:text-yellow-500 transition-colors">
              <Bookmark size={20} strokeWidth={1.5} />
              <span className="text-xs">256</span>
            </button>
          </div>
          <button className="hover:text-gray-600 transition-colors">
            <Share2 size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
