import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  traceId?: string;
  message?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  traceId?: string;
  status?: number;
}

// ──────────────────────────────────────────────────────────
// Token helpers (safe for SSR — check typeof window)
// ──────────────────────────────────────────────────────────

const TOKEN_KEY = 'xhs_access_token';
const REFRESH_KEY = 'xhs_refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ──────────────────────────────────────────────────────────
// Axios instance
// ──────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request interceptor: attach Bearer token ──
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: extract traceId + handle 401 ──
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Extract traceId from headers or body and attach to response
    const traceId =
      response.headers['x-trace-id'] ??
      response.headers['x-request-id'] ??
      (response.data as ApiResponse)?.traceId;
    if (traceId) {
      (response as AxiosResponse & { traceId: string }).traceId = traceId;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    const traceId =
      error.response?.headers?.['x-trace-id'] ??
      error.response?.headers?.['x-request-id'] ??
      (error.response?.data as ApiResponse)?.traceId;

    if (error.response?.status !== 401 || originalRequest._retry) {
      // Log error with traceId for debugging
      console.error('[API Error]', {
        url: originalRequest?.url,
        status: error.response?.status,
        message: (error.response?.data as ApiError)?.message ?? error.message,
        traceId,
      });
      return Promise.reject(buildApiError(error, traceId as string | undefined));
    }

    // 401 → attempt token refresh
    if (isRefreshing) {
      return new Promise<AxiosResponse>((resolve) => {
        refreshQueue.push((newToken: string) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          }
          resolve(api(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post<{ accessToken: string; refreshToken?: string }>(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/auth/refresh`,
        { refreshToken },
      );

      setTokens(data.accessToken, data.refreshToken);

      // Flush queue
      refreshQueue.forEach((cb) => cb(data.accessToken));
      refreshQueue = [];

      // Retry original
      if (originalRequest.headers) {
        originalRequest.headers['Authorization'] = `Bearer ${data.accessToken}`;
      }
      return api(originalRequest);
    } catch (refreshError) {
      refreshQueue = [];
      clearTokens();
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ──────────────────────────────────────────────────────────
// Error builder
// ──────────────────────────────────────────────────────────

function buildApiError(error: AxiosError, traceId?: string): ApiError {
  return {
    message:
      (error.response?.data as ApiError)?.message ??
      error.message ??
      '请求失败，请稍后重试',
    code: (error.response?.data as ApiError)?.code,
    status: error.response?.status,
    traceId,
  };
}

// ──────────────────────────────────────────────────────────
// Type-safe wrappers
// ──────────────────────────────────────────────────────────

export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.get<ApiResponse<T>>(url, { params, ...config });
  return response.data.data ?? (response.data as unknown as T);
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.post<ApiResponse<T>>(url, body, config);
  return response.data.data ?? (response.data as unknown as T);
}

export async function apiPut<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.put<ApiResponse<T>>(url, body, config);
  return response.data.data ?? (response.data as unknown as T);
}

export async function apiDelete<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.delete<ApiResponse<T>>(url, config);
  return response.data.data ?? (response.data as unknown as T);
}

export default api;
