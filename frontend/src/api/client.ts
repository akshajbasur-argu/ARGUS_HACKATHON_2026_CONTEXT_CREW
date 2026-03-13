import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

/**
 * Central Axios instance.
 * In Docker dev, Vite proxies /api → backend:8000, so we use '/api' as base.
 * For standalone local dev set VITE_API_URL=http://localhost:8000 in your .env.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// ── Request interceptor (attach JWT Bearer token) ───────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor (401 → auto-logout) ───────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)
