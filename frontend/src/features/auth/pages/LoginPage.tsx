import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiClient } from '@/api/client'
import { FormInput } from '@/shared/components/FormField'
import { useAuthStore, ROLE_HOME } from '@/store/authStore'

/* ── Schema ───────────────────────────────────────────────────────────── */

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})
type LoginData = z.infer<typeof loginSchema>

/* ── Component ─────────────────────────────────────────────────────────── */

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const justRegistered = (location.state as { registered?: boolean })?.registered === true

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = useCallback(
    async (data: LoginData) => {
      setApiError(null)
      setLoading(true)
      try {
        /* 1. Get tokens */
        const loginRes = await apiClient.post('/v1/auth/login', {
          email: data.email,
          password: data.password,
        })
        const { access_token, refresh_token } = loginRes.data

        /* 2. Fetch user profile */
        const meRes = await apiClient.get('/v1/auth/me', {
          headers: { Authorization: `Bearer ${access_token}` },
        })
        const user = meRes.data

        /* 3. Store auth state */
        setAuth(user, access_token, refresh_token)

        /* 4. Redirect based on role */
        const home = ROLE_HOME[user.role as keyof typeof ROLE_HOME] || '/dashboard'
        navigate(home, { replace: true })
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response
            ?.data?.detail ?? 'Invalid email or password. Please try again.'
        setApiError(msg)
      } finally {
        setLoading(false)
      }
    },
    [navigate, setAuth],
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold text-soil">
            GrantFlow
          </h1>
          <p className="mt-1 font-body text-sm text-bark">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-sand bg-parchment shadow-card">
          <div className="rounded-t-xl border-b border-sand bg-soil px-6 py-4">
            <h2 className="font-heading text-lg font-semibold text-cream">
              Sign In
            </h2>
          </div>

          <div className="px-6 py-6">
            {justRegistered && (
              <div className="mb-4 rounded-lg border border-moss/30 bg-moss/10 px-4 py-3">
                <p className="font-body text-sm text-moss">
                  Registration successful! Please sign in with your credentials.
                </p>
              </div>
            )}

            {apiError && (
              <div className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3">
                <p className="font-body text-sm text-rust">{apiError}</p>
              </div>
            )}

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <FormInput
                label="Email"
                type="email"
                required
                placeholder="you@organisation.org"
                error={form.formState.errors.email?.message}
                {...form.register('email')}
              />

              <FormInput
                label="Password"
                type="password"
                required
                placeholder="Enter your password"
                error={form.formState.errors.password?.message}
                {...form.register('password')}
              />

              <button
                type="submit"
                disabled={loading}
                className="btn-primary mt-2 w-full"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <p className="text-center font-body text-xs text-sand">
                Don&apos;t have an account?{' '}
                <a href="/register" className="text-clay hover:underline">
                  Create one
                </a>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
