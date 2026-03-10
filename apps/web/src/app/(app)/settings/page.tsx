'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { User as SharedUser } from '@xhs/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, ChevronRight, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE_OPTIONS = [
  { value: 'warm', label: '温暖' },
  { value: 'aspirational', label: '向往' },
  { value: 'informative', label: '干货' },
  { value: 'funny', label: '搞笑' },
];

const RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '4:3', label: '4:3 横版' },
  { value: '9:16', label: '9:16 全屏' },
  { value: '16:9', label: '16:9 宽屏' },
];

const LANGUAGE_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  // The auth store User is a local type; cast to shared User to access preferences
  const sharedUser = user as unknown as SharedUser | null;

  const [defaultTone, setDefaultTone] = useState<string>(sharedUser?.defaultTone ?? 'warm');
  const [defaultRatio, setDefaultRatio] = useState<string>(sharedUser?.defaultRatio ?? '3:4');
  const [preferredLanguage, setPreferredLanguage] = useState<string>(sharedUser?.preferredLanguage ?? 'zh');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleLogout = () => {
    if (!confirm('确定要退出登录吗？')) return;
    logout();
    router.push('/');
  };

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto animate-fade-in pb-24">
      <h1 className="text-xl font-bold text-gray-900">设置</h1>

      {/* ── 账号信息 ── */}
      <section className="space-y-1">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">账号信息</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Email row */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">邮箱</p>
              <p className="text-sm font-medium text-gray-800">{user?.email ?? '—'}</p>
            </div>
          </div>

          {/* Change password */}
          <button
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm text-gray-700">修改密码</span>
            <ChevronRight size={16} className="text-gray-400" />
          </button>

          {showPasswordForm && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
              <p className="text-xs text-gray-400 pt-3">密码修改功能即将上线，请关注更新。</p>
            </div>
          )}
        </div>
      </section>

      {/* ── 发布偏好 ── */}
      <section className="space-y-1">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">发布偏好</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
          {/* Default tone */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700">默认风格</span>
            <Select value={defaultTone} onValueChange={setDefaultTone}>
              <SelectTrigger className="w-28 h-8 text-sm border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default ratio */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700">默认图片比例</span>
            <Select value={defaultRatio} onValueChange={setDefaultRatio}>
              <SelectTrigger className="w-32 h-8 text-sm border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATIO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preferred language */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700">输入语言</span>
            <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
              <SelectTrigger className="w-28 h-8 text-sm border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── 小红书账号 ── */}
      <section className="space-y-1">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">小红书账号</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <Link
            href="/settings/xhs"
            className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              {/* XHS mini logo */}
              <div className="w-10 h-10 bg-[#FF2442] rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg font-bold leading-none">小</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">小红书账号管理</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {sharedUser?.xhsSessionLinkedAt
                    ? '已连接 · 点击管理'
                    : '未连接 · 点击连接账号'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  sharedUser?.xhsSessionLinkedAt ? 'bg-green-400' : 'bg-gray-300',
                )}
              />
              <ExternalLink size={16} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
          </Link>
        </div>
      </section>

      {/* ── 危险操作 ── */}
      <section className="space-y-1">
        <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider px-1">危险操作</h2>
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-red-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
                <LogOut size={20} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-600">退出登录</p>
                <p className="text-xs text-red-400 mt-0.5">退出后需重新登录</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-red-400" />
          </button>
        </div>
      </section>

      {/* Version note */}
      <p className="text-center text-xs text-gray-300 pb-4">XHS Agent v0.1.0</p>
    </div>
  );
}
