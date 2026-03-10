'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  hashtags: string[];
  onChange: (hashtags: string[]) => void;
  maxTags?: number;
}

export function HashtagEditor({ hashtags, onChange, maxTags = 30 }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDelete = (index: number) => {
    const next = hashtags.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleAdd = () => {
    const tag = inputValue.trim().replace(/^#/, '');
    if (tag && !hashtags.includes(tag) && hashtags.length < maxTags) {
      onChange([...hashtags, tag]);
    }
    setInputValue('');
    setIsAdding(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setIsAdding(false);
    } else if (e.key === 'Backspace' && inputValue === '' && hashtags.length > 0) {
      // Delete last tag on backspace when input is empty
      handleDelete(hashtags.length - 1);
    }
  };

  const startAdding = () => {
    if (hashtags.length >= maxTags) return;
    setIsAdding(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="space-y-2">
      {/* Count indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {hashtags.length}/{maxTags} 个话题
        </span>
      </div>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-2">
        {hashtags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFF0F2] text-[#FF2442] text-sm font-medium border border-[#FFD6DC] group transition-colors"
          >
            <span className="text-[#FF2442]/60">#</span>
            {tag}
            <button
              onClick={() => handleDelete(index)}
              className="ml-0.5 rounded-full hover:bg-[#FF2442] hover:text-white p-0.5 transition-colors"
              aria-label={`删除 ${tag}`}
            >
              <X size={10} strokeWidth={3} />
            </button>
          </span>
        ))}

        {/* Inline input when adding */}
        {isAdding && (
          <div className="inline-flex items-center px-3 py-1 rounded-full border-2 border-[#FF2442] bg-white text-sm">
            <span className="text-[#FF2442]/60 mr-0.5">#</span>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleAdd}
              placeholder="输入话题"
              className="outline-none bg-transparent text-[#FF2442] placeholder:text-gray-300 w-20 min-w-[60px]"
              style={{ width: `${Math.max(60, inputValue.length * 14 + 20)}px` }}
            />
          </div>
        )}

        {/* Add button */}
        {!isAdding && hashtags.length < maxTags && (
          <button
            onClick={startAdding}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1 rounded-full border-2 border-dashed text-sm font-medium transition-colors',
              'border-gray-300 text-gray-400 hover:border-[#FF2442] hover:text-[#FF2442] hover:bg-[#FFF0F2]',
            )}
          >
            <Plus size={14} strokeWidth={2.5} />
            添加话题
          </button>
        )}
      </div>
    </div>
  );
}
