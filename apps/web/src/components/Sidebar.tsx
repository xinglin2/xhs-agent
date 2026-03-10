'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Home, PlusSquare, Clock, Settings, Shield, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const baseNavItems = [
  { href: '/dashboard', icon: Home, label: '首页' },
  { href: '/create', icon: PlusSquare, label: '创作' },
  { href: '/history', icon: Clock, label: '历史' },
  { href: '/settings', icon: Settings, label: '设置' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const navItems = [
    ...baseNavItems,
    ...(user?.role === 'admin'
      ? [{ href: '/admin', icon: Shield, label: '管理后台' }]
      : []),
  ];

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="flex flex-col w-64 h-screen bg-white border-r border-gray-100 sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-gray-100 flex-shrink-0">
        <div className="w-8 h-8 bg-[#FF2442] rounded-xl flex items-center justify-center">
          <span className="text-white font-bold text-base leading-none">小</span>
        </div>
        <span className="font-bold text-gray-900 text-base">XHS Agent</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-[#FFF0F2] text-[#FF2442]'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.75}
              />
              {label}
              {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF2442]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 flex-shrink-0 border-t border-gray-100 pt-3 space-y-1">
        {/* User info */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-8 h-8 bg-[#FFF0F2] rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-[#FF2442] text-sm font-semibold">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-800 font-medium truncate">{user?.email}</p>
            {user?.role === 'admin' && (
              <p className="text-[10px] text-[#FF2442]">管理员</p>
            )}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all duration-150"
        >
          <LogOut size={18} strokeWidth={1.75} />
          退出登录
        </button>
      </div>
    </div>
  );
}
