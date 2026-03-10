'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusSquare, Clock, Settings, Shield } from 'lucide-react';

interface Props {
  userRole?: 'user' | 'admin';
}

const baseItems = [
  { href: '/dashboard', icon: Home, label: '首页' },
  { href: '/create', icon: PlusSquare, label: '创作' },
  { href: '/history', icon: Clock, label: '历史' },
  { href: '/settings', icon: Settings, label: '设置' },
];

export function BottomNav({ userRole }: Props) {
  const pathname = usePathname();

  const items = [
    ...baseItems,
    ...(userRole === 'admin'
      ? [{ href: '/admin', icon: Shield, label: '管理' }]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-50">
      {items.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
              active ? 'text-[#FF2442]' : 'text-gray-500'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
