'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function LoginForm() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      toast({ title: '登录失败', description: error ?? '请检查邮箱和密码', variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">邮箱</Label>
        <Input
          id="login-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="input-xhs"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="login-password">密码</Label>
        <div className="relative">
          <Input
            id="login-password"
            type={showPwd ? 'text' : 'password'}
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="input-xhs pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <Button
        type="submit"
        disabled={isLoading}
        className="btn-xhs-primary w-full h-12 text-base"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            登录中...
          </>
        ) : (
          '登录'
        )}
      </Button>
    </form>
  );
}

function RegisterForm() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError('');

    if (password !== confirm) {
      setLocalError('两次输入的密码不一致');
      return;
    }
    if (password.length < 8) {
      setLocalError('密码至少需要8位字符');
      return;
    }

    try {
      await register(email, password);
      toast({ title: '注册成功！', description: '欢迎加入 XHS Agent' });
      router.push('/dashboard');
    } catch {
      toast({ title: '注册失败', description: error ?? '该邮箱可能已被注册', variant: 'destructive' });
    }
  };

  const displayError = localError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">邮箱</Label>
        <Input
          id="reg-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="input-xhs"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-password">密码</Label>
        <div className="relative">
          <Input
            id="reg-password"
            type={showPwd ? 'text' : 'password'}
            placeholder="至少8位字符"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="input-xhs pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-confirm">确认密码</Label>
        <Input
          id="reg-confirm"
          type={showPwd ? 'text' : 'password'}
          placeholder="再次输入密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className="input-xhs"
        />
      </div>

      {displayError && (
        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{displayError}</p>
      )}

      <Button
        type="submit"
        disabled={isLoading}
        className="btn-xhs-primary w-full h-12 text-base"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            注册中...
          </>
        ) : (
          '创建账号'
        )}
      </Button>

      <p className="text-center text-xs text-gray-400">
        注册即表示您同意我们的服务条款与隐私政策
      </p>
    </form>
  );
}

export default function AuthPage() {
  return (
    <div className="animate-fade-in">
      <Tabs defaultValue="login">
        <TabsList className="w-full mb-6 bg-xhs-gray rounded-xhs p-1">
          <TabsTrigger value="login" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            登录
          </TabsTrigger>
          <TabsTrigger value="register" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            注册
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <LoginForm />
        </TabsContent>

        <TabsContent value="register">
          <RegisterForm />
        </TabsContent>
      </Tabs>

      <div className="mt-6 pt-4 border-t border-gray-100 text-center">
        <a
          href="https://github.com/xhs-agent"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-xhs-muted hover:text-xhs-red transition-colors"
        >
          了解更多关于 XHS Agent →
        </a>
      </div>
    </div>
  );
}
