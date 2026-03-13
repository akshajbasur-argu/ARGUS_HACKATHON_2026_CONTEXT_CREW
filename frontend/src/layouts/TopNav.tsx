import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore, ROLE_HOME } from '@/store/authStore'
import { cn } from '@/shared/utils/cn'

interface TopNavProps {
  onToggleSidebar?: () => void
  showHamburger?: boolean
  minimal?: boolean
}

export function TopNav({ onToggleSidebar, showHamburger = false, minimal = false }: TopNavProps) {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-bark/30 bg-soil px-4 md:px-6">
      {/* Left: hamburger + logo */}
      <div className="flex items-center gap-3">
        {showHamburger && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-md p-1.5 text-sand transition-colors hover:bg-bark hover:text-cream lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <Link
          to={isAuthenticated && user ? ROLE_HOME[user.role] : '/'}
          className="flex items-center gap-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-clay">
            <span className="font-heading text-sm font-bold text-cream">G</span>
          </div>
          <span className="font-heading text-lg font-semibold text-cream">
            GrantFlow
          </span>
        </Link>
      </div>

      {/* Right: user menu or login link */}
      <div className="flex items-center gap-3">
        {minimal && !isAuthenticated && (
          <Link
            to="/login"
            className="rounded-md px-3 py-1.5 font-body text-sm font-medium text-sand transition-colors hover:bg-bark hover:text-cream"
          >
            Sign in
          </Link>
        )}

        {isAuthenticated && user && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bark"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-clay text-xs font-bold text-cream">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden font-body text-sm text-sand md:inline">
                {user.full_name}
              </span>
              <svg className="h-4 w-4 text-sand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-sand bg-cream py-1 shadow-card-hover">
                  <div className="border-b border-straw px-4 py-2">
                    <p className="font-body text-sm font-medium text-soil">{user.full_name}</p>
                    <p className="font-mono text-xs text-sand">{user.email}</p>
                    <span className={cn(
                      'mt-1 inline-block rounded-pill px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider',
                      'bg-clay/10 text-clay',
                    )}>
                      {user.role.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left font-body text-sm text-rust transition-colors hover:bg-parchment"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
