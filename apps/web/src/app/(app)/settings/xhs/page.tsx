'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
  Link2,
  Unlink2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface XhsStatus {
  linked: boolean;
  lastVerifiedAt?: string;
  sessionHealth?: 'healthy' | 'degraded' | 'expired';
  username?: string;
}

const LINK_STEPS = [
  {
    step: 1,
    title: '安装 EditThisCookie 浏览器插件',
    desc: '在 Chrome Web Store 搜索并安装 "EditThisCookie" 扩展。',
  },
  {
    step: 2,
    title: '在小红书网页端登录',
    desc: '打开 www.xiaohongshu.com 并用你的账号登录。',
  },
  {
    step: 3,
    title: '导出 Cookie',
    desc: '点击 EditThisCookie 图标 → 选择 "导出" → 复制 JSON 内容。',
  },
  {
    step: 4,
    title: '粘贴 Cookie 并完成连接',
    desc: '将复制的内容粘贴到下方输入框，点击"完成连接"。',
  },
];

function HealthBadge({ health }: { health?: XhsStatus['sessionHealth'] }) {
  if (!health) return null;
  const config = {
    healthy: { label: '会话正常', icon: <Wifi size={14} />, cls: 'text-green-700 bg-green-100' },
    degraded: { label: '会话异常', icon: <AlertTriangle size={14} />, cls: 'text-yellow-700 bg-yellow-100' },
    expired: { label: '会话已过期', icon: <XCircle size={14} />, cls: 'text-red-700 bg-red-100' },
  };
  const c = config[health];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

export default function XhsSettingsPage() {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [status, setStatus] = useState<XhsStatus>({ linked: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showCookieInput, setShowCookieInput] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [cookieError, setCookieError] = useState('');

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<XhsStatus>('/xhs/status');
      setStatus(data);
    } catch {
      // Not yet linked
      setStatus({ linked: false });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    setCookieError('');
    if (!cookieInput.trim()) {
      setCookieError('请粘贴 Cookie JSON 内容');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cookieInput);
    } catch {
      setCookieError('Cookie 格式无效，请确认粘贴的是 JSON 格式');
      return;
    }

    setIsConnecting(true);
    try {
      await apiPost('/xhs/connect', { cookies: parsed });
      toast({ title: '🎉 连接成功！', description: '小红书账号已成功连接' });
      setShowCookieInput(false);
      setCookieInput('');
      await fetchStatus();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '连接失败，请检查 Cookie 是否有效';
      setCookieError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('确定要断开小红书账号连接吗？')) return;
    setIsDisconnecting(true);
    try {
      await apiDelete('/xhs/disconnect');
      toast({ title: '已断开连接', description: '小红书账号连接已移除' });
      setStatus({ linked: false });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '断开失败';
      toast({ title: '操作失败', description: msg, variant: 'destructive' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xhs" />
        ))}
      </div>
    );
  }

  const daysSinceVerified = status.lastVerifiedAt
    ? Math.floor((Date.now() - new Date(status.lastVerifiedAt).getTime()) / 86400000)
    : null;

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold text-xhs-dark">小红书账号设置</h1>

      {/* Status card */}
      <div className="card-xhs p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${status.linked ? 'bg-green-100' : 'bg-gray-100'}`}>
              {status.linked ? (
                <CheckCircle2 size={22} className="text-green-600" />
              ) : (
                <XCircle size={22} className="text-gray-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-xhs-dark">
                {status.linked ? `已连接 ✓` : '未连接'}
              </p>
              {status.linked ? (
                <div className="space-y-1 mt-1">
                  {status.username && (
                    <p className="text-sm text-xhs-muted">@{status.username}</p>
                  )}
                  {daysSinceVerified !== null && (
                    <p className="text-xs text-xhs-muted">
                      上次验证：{daysSinceVerified === 0 ? '今天' : `${daysSinceVerified}天前`}
                    </p>
                  )}
                  <HealthBadge health={status.sessionHealth} />
                </div>
              ) : (
                <p className="text-sm text-xhs-muted mt-1">请按照下方步骤连接你的小红书账号</p>
              )}
            </div>
          </div>

          <button
            onClick={fetchStatus}
            className="p-2 hover:bg-gray-100 rounded-full text-xhs-muted hover:text-xhs-dark transition-colors"
            title="刷新状态"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-3">
          {!status.linked ? (
            <button
              onClick={() => setShowCookieInput(!showCookieInput)}
              className="btn-xhs-primary flex items-center gap-2 px-5 py-2 text-sm"
            >
              <Link2 size={16} />
              开始连接
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xhs bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {isDisconnecting ? <Loader2 size={16} className="animate-spin" /> : <Unlink2 size={16} />}
              断开连接
            </button>
          )}
        </div>
      </div>

      {/* Cookie input panel */}
      {showCookieInput && !status.linked && (
        <div className="card-xhs p-5 animate-slide-up space-y-4">
          <h2 className="font-semibold text-xhs-dark">粘贴 Cookie JSON</h2>
          <textarea
            value={cookieInput}
            onChange={(e) => {
              setCookieInput(e.target.value);
              setCookieError('');
            }}
            placeholder='[{"name": "web_session", "value": "...", ...}]'
            className="input-xhs w-full h-32 text-xs font-mono resize-none"
          />
          {cookieError && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{cookieError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCookieInput(false); setCookieError(''); }}
              className="btn-xhs-ghost flex-1 py-2 text-sm"
            >
              取消
            </button>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="btn-xhs-primary flex-[2] py-2 text-sm flex items-center justify-center gap-2"
            >
              {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              完成连接
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!status.linked && (
        <div className="card-xhs p-5">
          <h2 className="font-semibold text-xhs-dark mb-4">连接步骤</h2>
          <div className="space-y-4">
            {LINK_STEPS.map((s) => (
              <div key={s.step} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-xhs-pink text-xhs-red flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
                  {s.step}
                </div>
                <div>
                  <p className="text-sm font-medium text-xhs-dark">{s.title}</p>
                  <p className="text-xs text-xhs-muted mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xhs px-4 py-3">
            <p className="text-xs text-amber-700">
              ⚠️ <strong>安全提示：</strong>你的 Cookie 将加密存储在服务器上，仅用于小红书内容发布。请勿将 Cookie 分享给任何人。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
