'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ApiKey, UsageLog, SystemHealth } from '@/types';
import { 
  Plus, Trash2, ToggleLeft, ToggleRight, Download, 
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2,
  Shield
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/utils';

// ── Sub-components ──

function ApiKeysTab() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<ApiKey[]>('/admin/api-keys');
      setKeys(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleAdd = async () => {
    if (!newKeyName.trim()) return;
    setIsAdding(true);
    try {
      const data = await apiPost<{ key: ApiKey; rawKey: string }>('/admin/api-keys', { name: newKeyName.trim() });
      setNewKeyValue(data.rawKey);
      setKeys((prev) => [data.key, ...prev]);
      setNewKeyName('');
    } catch (err: unknown) {
      toast({ title: '创建失败', description: (err as { message?: string })?.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (key: ApiKey) => {
    try {
      await apiPut(`/admin/api-keys/${key.id}`, { isActive: !key.isActive });
      setKeys((prev) => prev.map((k) => k.id === key.id ? { ...k, isActive: !k.isActive } : k));
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此 API 密钥？')) return;
    try {
      await apiDelete(`/admin/api-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast({ title: '已删除' });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-xhs-muted">共 {keys.length} 个密钥</p>
        <button onClick={() => setShowAddModal(true)} className="btn-xhs-primary flex items-center gap-1 px-4 py-2 text-sm">
          <Plus size={16} />
          添加密钥
        </button>
      </div>

      {/* New key modal */}
      {showAddModal && (
        <div className="card-xhs p-4 border-2 border-xhs-red/20 animate-slide-up space-y-3">
          <h3 className="font-semibold text-sm">创建新 API 密钥</h3>
          {newKeyValue ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                ⚠️ 请立即复制此密钥，它只会显示一次！
              </p>
              <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs break-all select-all">
                {newKeyValue}
              </div>
              <button onClick={() => { setShowAddModal(false); setNewKeyValue(null); }} className="btn-xhs-primary w-full py-2 text-sm">
                我已复制，关闭
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="密钥名称（如：Production）"
                className="input-xhs w-full text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowAddModal(false)} className="btn-xhs-ghost flex-1 py-2 text-sm">取消</button>
                <button onClick={handleAdd} disabled={isAdding} className="btn-xhs-primary flex-[2] py-2 text-sm flex items-center justify-center gap-2">
                  {isAdding ? <Loader2 size={16} className="animate-spin" /> : null}
                  创建
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="skeleton h-16 rounded-xhs" />)}</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 text-xhs-muted text-sm">暂无 API 密钥</div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="card-xhs p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{key.name}</p>
                <p className="text-xs text-xhs-muted font-mono mt-0.5">{key.keyPreview}</p>
                <p className="text-xs text-xhs-muted">使用次数: {key.requestCount} · {formatDate(key.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleToggle(key)} className="text-xhs-muted hover:text-xhs-red transition-colors">
                  {key.isActive ? <ToggleRight size={22} className="text-green-500" /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={() => handleDelete(key.id)} className="text-xhs-muted hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageLogsTab() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        const data = await apiGet<UsageLog[]>('/admin/usage-logs');
        setLogs(data);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filtered = filter
    ? logs.filter((l) => l.userEmail.includes(filter) || l.action.includes(filter))
    : logs;

  const exportCsv = () => {
    const headers = ['时间', '用户', '操作', '模型', 'Tokens', '费用', '状态'];
    const rows = filtered.map((l) => [
      l.createdAt, l.userEmail, l.action, l.model ?? '', l.tokensUsed ?? '', l.cost ?? '', l.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="按用户邮箱或操作筛选..."
          className="input-xhs flex-1 text-sm"
        />
        <button onClick={exportCsv} className="btn-xhs-ghost flex items-center gap-1 px-4 py-2 text-sm flex-shrink-0">
          <Download size={16} />
          导出 CSV
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xhs" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 text-xhs-muted font-medium">时间</th>
                <th className="text-left py-2 px-2 text-xhs-muted font-medium">用户</th>
                <th className="text-left py-2 px-2 text-xhs-muted font-medium">操作</th>
                <th className="text-left py-2 px-2 text-xhs-muted font-medium">Tokens</th>
                <th className="text-left py-2 px-2 text-xhs-muted font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-xhs-muted">暂无日志</td></tr>
              ) : filtered.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-2 text-xhs-muted whitespace-nowrap">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="py-2 px-2 max-w-[120px] truncate">{log.userEmail}</td>
                  <td className="py-2 px-2">{log.action}</td>
                  <td className="py-2 px-2">{log.tokensUsed ?? '--'}</td>
                  <td className="py-2 px-2">
                    <span className={`status-badge ${log.status === 'success' ? 'status-published' : 'status-failed'}`}>
                      {log.status === 'success' ? '成功' : '失败'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string; isActive: boolean; createdAt: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const data = await apiGet<typeof users>('/admin/users');
        setUsers(data);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await apiPut(`/admin/users/${id}`, { isActive: !isActive });
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: !isActive } : u));
      toast({ title: isActive ? '用户已停用' : '用户已启用' });
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-xhs-muted">共 {users.length} 位用户</p>
      {isLoading ? (
        <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xhs" />)}</div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="card-xhs p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`status-badge ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'status-draft'}`}>
                    {user.role === 'admin' ? '管理员' : '用户'}
                  </span>
                  <span className="text-xs text-xhs-muted">{formatDate(user.createdAt)}</span>
                </div>
              </div>
              <button
                onClick={() => handleToggle(user.id, user.isActive)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  user.isActive
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                {user.isActive ? '停用' : '启用'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SystemStatusTab() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<SystemHealth>('/health');
      setHealth(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const statusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle2 size={18} className="text-green-500" />;
    if (status === 'degraded') return <AlertTriangle size={18} className="text-yellow-500" />;
    return <XCircle size={18} className="text-red-500" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'healthy') return '正常';
    if (status === 'degraded') return '异常';
    return '离线';
  };

  const services = health ? [
    { name: 'API 服务', status: health.api },
    { name: '发布服务', status: health.publisher },
    { name: '数据库', status: health.database },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-xhs-muted">
          {health ? `版本: ${health.version} · 运行时间: ${Math.floor(health.uptime / 3600)}h` : ''}
        </p>
        <button onClick={fetchHealth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <RefreshCw size={16} className="text-xhs-muted" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="skeleton h-16 rounded-xhs" />)}</div>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => (
            <div key={svc.name} className="card-xhs p-4 flex items-center justify-between">
              <p className="font-medium text-sm">{svc.name}</p>
              <div className="flex items-center gap-2">
                {statusIcon(svc.status)}
                <span className={`text-sm font-medium ${svc.status === 'healthy' ? 'text-green-600' : svc.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'}`}>
                  {statusLabel(svc.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin page ──

const ADMIN_TABS = [
  { value: 'keys', label: 'API密钥' },
  { value: 'logs', label: '使用日志' },
  { value: 'users', label: '用户管理' },
  { value: 'status', label: '系统状态' },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, accessToken, initialize } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('keys');

  useEffect(() => {
    initialize();
    setMounted(true);
  }, [initialize]);

  useEffect(() => {
    if (mounted && (!accessToken || user?.role !== 'admin')) {
      router.replace('/dashboard');
    }
  }, [mounted, accessToken, user, router]);

  if (!mounted || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-xhs-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-xhs-gray">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-xhs-red" />
          <span className="font-bold text-xhs-dark">管理后台</span>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-xhs-muted hover:text-xhs-dark transition-colors"
        >
          返回应用
        </button>
      </header>

      <div className="p-4 max-w-4xl mx-auto animate-fade-in">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xhs p-1 shadow-xhs-card mb-5">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                activeTab === tab.value
                  ? 'bg-xhs-red text-white shadow-sm'
                  : 'text-xhs-muted hover:text-xhs-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="animate-fade-in">
          {activeTab === 'keys' && <ApiKeysTab />}
          {activeTab === 'logs' && <UsageLogsTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'status' && <SystemStatusTab />}
        </div>
      </div>
    </div>
  );
}
