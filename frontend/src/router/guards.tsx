import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, ROLE_HOME, type UserRole } from '@/store/authStore'

// ── Protect routes that require authentication + optional role check ────────

interface RequireAuthProps {
  children: React.ReactNode
  roles?: UserRole[]
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && !roles.includes(user.role)) {
    const home = ROLE_HOME[user.role] ?? '/login'
    return <Navigate to={home} replace />
  }

  return <>{children}</>
}

// ── Redirect authenticated users away from login/register ───────────────────

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()

  if (isAuthenticated && user) {
    const home = ROLE_HOME[user.role] ?? '/dashboard'
    return <Navigate to={home} replace />
  }

  return <>{children}</>
}
