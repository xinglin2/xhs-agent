'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConsentModal({ onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState(false);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-fade-in" />

        {/* Content */}
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[90vw] max-w-md bg-white rounded-2xl shadow-2xl outline-none',
            'animate-slide-up max-h-[85vh] flex flex-col',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center">
                <ShieldAlert size={18} className="text-amber-500" />
              </div>
              <Dialog.Title className="text-base font-bold text-gray-900">
                了解自动发布功能
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                onClick={onCancel}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm text-gray-700 leading-relaxed">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="font-semibold text-amber-800 mb-1">⚠️ 请在使用前仔细阅读</p>
              <p className="text-amber-700 text-xs">
                自动发布功能通过浏览器自动化技术操作你的小红书账号，存在以下风险，请知悉。
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="font-semibold text-gray-900 mb-1">🤖 浏览器自动化风险</p>
                <p className="text-gray-600 text-xs">
                  本功能使用 Playwright 等浏览器自动化技术在后台模拟用户操作。这种方式与真人操作存在一定差异，平台可能通过行为分析检测到自动化行为。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-1">📋 小红书服务条款</p>
                <p className="text-gray-600 text-xs">
                  使用自动化工具发布内容可能违反小红书（Xiaohongshu）平台的用户服务协议。XHS Agent 不对因违反平台条款而导致的任何后果承担责任。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-1">🚫 账号封禁风险</p>
                <p className="text-gray-600 text-xs">
                  若平台检测到异常行为，你的账号可能面临功能限制、临时封禁或永久封禁的风险。请谨慎使用，建议控制发布频率，避免批量、高频操作。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-1">🔐 账号安全</p>
                <p className="text-gray-600 text-xs">
                  你的 Cookie 凭证存储在加密服务器上，我们不会将其用于任何发布之外的目的。但请注意，一旦 Cookie 泄露，他人可能访问你的账号。
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-blue-700 text-xs">
                💡 <strong>建议：</strong>如果你对风险有顾虑，可以使用「复制文案」功能手动发布内容，同样简单便捷且更加安全。
              </p>
            </div>
          </div>

          {/* Checkbox */}
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={cn(
                    'w-5 h-5 rounded border-2 transition-all duration-150 flex items-center justify-center',
                    checked
                      ? 'bg-[#FF2442] border-[#FF2442]'
                      : 'bg-white border-gray-300 group-hover:border-[#FF2442]',
                  )}
                >
                  {checked && (
                    <svg
                      width="12"
                      height="10"
                      viewBox="0 0 12 10"
                      fill="none"
                      className="text-white"
                    >
                      <path
                        d="M1 5L4.5 8.5L11 1"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-700 leading-relaxed">
                我已阅读并了解上述风险，同意使用自动发布功能
              </span>
            </label>
          </div>

          {/* Footer buttons */}
          <div className="px-5 pb-5 flex gap-3 flex-shrink-0">
            <button
              onClick={onCancel}
              className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              disabled={!checked}
              className={cn(
                'flex-[2] h-11 rounded-xl text-sm font-semibold transition-all duration-150',
                checked
                  ? 'bg-[#FF2442] text-white hover:bg-red-500 shadow-md active:scale-95'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed',
              )}
            >
              确认并继续
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
