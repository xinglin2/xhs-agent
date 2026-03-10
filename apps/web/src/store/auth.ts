import { create } from 'zustand';
import { apiPost, setTokens, clearTokens, getAccessToken } from '@/lib/api';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
  xhsLinked?: boolean;
  xhsLastVerified?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initialize: () => void;
  clearError: () => void;
}

// ──────────────────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────────────────

const USER_KEY = 'xhs_user';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiPost<AuthResponse>('/auth/login', { email, password });
      setTokens(data.accessToken, data.refreshToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }
      set({
        user: data.user,
        accessToken: data.accessToken,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        (err as { message?: string })?.message ?? '登录失败，请检查邮箱和密码';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiPost<AuthResponse>('/auth/register', { email, password });
      setTokens(data.accessToken, data.refreshToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }
      set({
        user: data.user,
        accessToken: data.accessToken,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        (err as { message?: string })?.message ?? '注册失败，该邮箱可能已被使用';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    clearTokens();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_KEY);
    }
    set({ user: null, accessToken: null, error: null });
  },

  initialize: () => {
    if (typeof window === 'undefined') return;
    const token = getAccessToken();
    const userStr = localStorage.getItem(USER_KEY);
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        set({ user, accessToken: token });
      } catch {
        clearTokens();
        localStorage.removeItem(USER_KEY);
      }
    }
  },

  clearError: () => set({ error: null }),
}));
