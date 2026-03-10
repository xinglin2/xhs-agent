import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatRelativeDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
  return formatDate(date);
}

export function detectLanguage(text: string): { code: string; label: string; flag: string } {
  if (!text || text.trim().length === 0) {
    return { code: 'unknown', label: '未知', flag: '🌐' };
  }

  // Simple heuristic detection
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const totalChars = text.replace(/\s/g, '').length;
  const chineseRatio = chineseChars / totalChars;

  if (chineseRatio > 0.3) return { code: 'zh', label: '中文', flag: '🇨🇳' };

  // Detect Japanese
  const japaneseChars = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length;
  if (japaneseChars > 2) return { code: 'ja', label: '日本語', flag: '🇯🇵' };

  // Detect Korean
  const koreanChars = (text.match(/[\uac00-\ud7af]/g) ?? []).length;
  if (koreanChars > 2) return { code: 'ko', label: '한국어', flag: '🇰🇷' };

  // Default to English
  return { code: 'en', label: 'English', flag: '🇬🇧' };
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  return Promise.resolve();
}
