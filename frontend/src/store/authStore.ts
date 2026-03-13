import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole =
  | 'platform_admin'
  | 'program_officer'
  | 'reviewer'
  | 'finance_officer'
  | 'applicant'

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  phone?: string | null
  organisation?: {
    id: string
    legal_name: string
    org_type: string
  } | null
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void
  updateTokens: (accessToken: string, refreshToken: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),

      updateTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    { name: 'grantflow-auth' },
  ),
)

/** Role → default landing path */
export const ROLE_HOME: Record<UserRole, string> = {
  applicant: '/dashboard',
  program_officer: '/staff/applications',
  reviewer: '/reviewer/queue',
  finance_officer: '/finance/dashboard',
  platform_admin: '/admin/users',
}
