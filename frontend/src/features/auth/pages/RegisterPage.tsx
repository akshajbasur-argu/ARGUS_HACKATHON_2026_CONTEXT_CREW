import { useCallback, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiClient } from '@/api/client'
import { FormInput, FormSelect } from '@/shared/components/FormField'
import { cn } from '@/shared/utils/cn'

/* ── Schemas ───────────────────────────────────────────────────────────── */

const accountSchema = z
  .object({
    full_name: z.string().min(1, 'Full name is required').max(255),
    email: z.string().email('Invalid email address'),
    phone: z.string().max(20).optional().or(z.literal('')),
    password: z.string().min(8, 'At least 8 characters').max(128),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })
type AccountData = z.infer<typeof accountSchema>

const otpSchema = z.object({
  d0: z.string().length(1),
  d1: z.string().length(1),
  d2: z.string().length(1),
  d3: z.string().length(1),
  d4: z.string().length(1),
  d5: z.string().length(1),
})
type OtpData = z.infer<typeof otpSchema>

const ORG_TYPES = [
  { value: 'ngo', label: 'NGO' },
  { value: 'trust', label: 'Trust' },
  { value: 'society', label: 'Society' },
  { value: 'company', label: 'Company (Sec 8)' },
  { value: 'government', label: 'Government' },
  { value: 'individual', label: 'Individual' },
]

const STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
]

const currentYear = new Date().getFullYear()

const orgSchema = z.object({
  legal_name: z.string().min(1, 'Legal name is required').max(512),
  registration_number: z
    .string()
    .regex(/^[A-Za-z0-9]{5,20}$/, 'Alphanumeric, 5-20 characters')
    .optional()
    .or(z.literal('')),
  org_type: z.string().min(1, 'Organisation type is required'),
  year_established: z.coerce
    .number()
    .int()
    .min(1900, 'Must be 1900 or later')
    .max(currentYear, `Cannot exceed ${currentYear}`)
    .optional()
    .or(z.literal(0).transform(() => undefined)),
  state: z.string().optional().or(z.literal('')),
  annual_budget_inr: z.coerce
    .number()
    .positive('Must be a positive number')
    .optional()
    .or(z.literal(0).transform(() => undefined)),
  contact_person: z.string().max(255).optional().or(z.literal('')),
})
type OrgData = z.infer<typeof orgSchema>

/* ── Steps ─────────────────────────────────────────────────────────────── */

const STEP_LABELS = ['Account', 'Verify Email', 'Organisation']

/* ── Component ─────────────────────────────────────────────────────────── */

export function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [email, setEmail] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /* Step 1: Account form */
  const accountForm = useForm<AccountData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
    },
  })

  /* Step 2: OTP form */
  const otpForm = useForm<OtpData>({
    resolver: zodResolver(otpSchema),
  })
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  /* Step 3: Organisation form */
  const orgForm = useForm<OrgData>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      legal_name: '',
      registration_number: '',
      org_type: '',
      state: '',
      contact_person: '',
    },
  })

  /* ── Step 1 submit ─────────────────────────────────────────────────── */
  const submitAccount = useCallback(
    async (data: AccountData) => {
      setApiError(null)
      setLoading(true)
      try {
        await apiClient.post('/v1/auth/register', {
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          phone: data.phone || null,
          legal_name: data.full_name + "'s Organisation",
          org_type: 'ngo',
        })
        setEmail(data.email)
        setStep(1)
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response
            ?.data?.detail ?? 'Registration failed. Please try again.'
        setApiError(msg)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  /* ── Step 2 submit ─────────────────────────────────────────────────── */
  const submitOtp = useCallback(
    async (data: OtpData) => {
      setApiError(null)
      setLoading(true)
      const otp = `${data.d0}${data.d1}${data.d2}${data.d3}${data.d4}${data.d5}`
      try {
        await apiClient.post('/v1/auth/verify-otp', { email, otp })
        setStep(2)
      } catch {
        setApiError('Invalid or expired OTP. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [email],
  )

  /* ── Step 3 submit ─────────────────────────────────────────────────── */
  const submitOrg = useCallback(
    async (data: OrgData) => {
      setApiError(null)
      setLoading(true)
      try {
        const loginRes = await apiClient.post('/v1/auth/login', {
          email,
          password: accountForm.getValues('password'),
        })
        const { access_token } = loginRes.data

        await apiClient.put(
          '/v1/auth/organisations/me',
          {
            legal_name: data.legal_name,
            registration_number: data.registration_number || null,
            org_type: data.org_type,
            year_established: data.year_established || null,
            state: data.state || null,
            annual_budget_inr: data.annual_budget_inr || null,
            contact_person: data.contact_person || null,
          },
          { headers: { Authorization: `Bearer ${access_token}` } },
        )

        navigate('/login', { state: { registered: true } })
      } catch {
        setApiError(
          'Failed to save organisation profile. Please try again.',
        )
      } finally {
        setLoading(false)
      }
    },
    [email, accountForm, navigate],
  )

  /* ── OTP digit input handler ───────────────────────────────────────── */
  const handleOtpInput = (idx: number, value: string) => {
    if (value.length === 1 && /^\d$/.test(value) && idx < 5) {
      otpRefs.current[idx + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    const field = `d${idx}` as keyof OtpData
    if (e.key === 'Backspace' && idx > 0 && !otpForm.getValues(field)) {
      otpRefs.current[idx - 1]?.focus()
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold text-soil">
            GrantFlow
          </h1>
          <p className="mt-1 font-body text-sm text-bark">
            Create your applicant account
          </p>
        </div>

        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono font-bold transition-colors',
                    i < step
                      ? 'bg-moss text-cream'
                      : i === step
                        ? 'bg-clay text-cream'
                        : 'bg-sand/40 text-sand',
                  )}
                >
                  {i < step ? (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    'font-body text-xs',
                    i <= step ? 'text-bark font-medium' : 'text-sand',
                  )}
                >
                  {label}
                </span>
              </div>
              {i < 2 && (
                <div
                  className={cn(
                    'h-px w-8',
                    i < step ? 'bg-moss' : 'bg-sand/40',
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-xl border border-sand bg-parchment shadow-card">
          <div className="rounded-t-xl border-b border-sand bg-soil px-6 py-4">
            <h2 className="font-heading text-lg font-semibold text-cream">
              {STEP_LABELS[step]}
            </h2>
          </div>

          <div className="px-6 py-6">
            {apiError && (
              <div className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3">
                <p className="font-body text-sm text-rust">{apiError}</p>
              </div>
            )}

            {/* ── Step 1: Account Details ──────────────────────────── */}
            {step === 0 && (
              <form
                onSubmit={accountForm.handleSubmit(submitAccount)}
                className="space-y-4"
              >
                <FormInput
                  label="Full Name"
                  required
                  placeholder="Your full name"
                  error={accountForm.formState.errors.full_name?.message}
                  {...accountForm.register('full_name')}
                />
                <FormInput
                  label="Email"
                  type="email"
                  required
                  placeholder="you@organisation.org"
                  error={accountForm.formState.errors.email?.message}
                  {...accountForm.register('email')}
                />
                <FormInput
                  label="Phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  error={accountForm.formState.errors.phone?.message}
                  {...accountForm.register('phone')}
                />
                <FormInput
                  label="Password"
                  type="password"
                  required
                  placeholder="Minimum 8 characters"
                  error={accountForm.formState.errors.password?.message}
                  {...accountForm.register('password')}
                />
                <FormInput
                  label="Confirm Password"
                  type="password"
                  required
                  placeholder="Re-enter your password"
                  error={
                    accountForm.formState.errors.confirm_password?.message
                  }
                  {...accountForm.register('confirm_password')}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary mt-2 w-full"
                >
                  {loading
                    ? 'Creating account...'
                    : 'Create Account & Send OTP'}
                </button>

                <p className="text-center font-body text-xs text-sand">
                  Already have an account?{' '}
                  <a href="/login" className="text-clay hover:underline">
                    Sign in
                  </a>
                </p>
              </form>
            )}

            {/* ── Step 2: OTP Verification ─────────────────────────── */}
            {step === 1 && (
              <form
                onSubmit={otpForm.handleSubmit(submitOtp)}
                className="space-y-6"
              >
                <p className="text-center font-body text-sm text-bark">
                  We sent a 6-digit code to{' '}
                  <span className="font-medium text-soil">{email}</span>
                  <br />
                  <span className="text-xs text-sand">
                    (Check your backend console for the OTP)
                  </span>
                </p>

                <div className="flex justify-center gap-2">
                  {([0, 1, 2, 3, 4, 5] as const).map((i) => {
                    const field = `d${i}` as keyof OtpData
                    const { ref: rhfRef, ...registerRest } = otpForm.register(
                      field,
                      {
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                          handleOtpInput(i, e.target.value),
                      },
                    )
                    return (
                      <input
                        key={i}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className={cn(
                          'h-12 w-11 rounded-lg border bg-cream text-center font-mono text-xl text-soil',
                          'focus:outline-none focus:ring-[3px]',
                          otpForm.formState.errors[field]
                            ? 'border-rust focus:ring-rust/30'
                            : 'border-sand focus:border-clay focus:ring-clay/30',
                        )}
                        {...registerRest}
                        ref={(el) => {
                          rhfRef(el)
                          otpRefs.current[i] = el
                        }}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      />
                    )
                  })}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full"
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <button
                  type="button"
                  className="btn-ghost w-full text-sm"
                  onClick={async () => {
                    setApiError(null)
                    try {
                      await apiClient.post('/v1/auth/register', {
                        ...accountForm.getValues(),
                        legal_name:
                          accountForm.getValues('full_name') +
                          "'s Organisation",
                        org_type: 'ngo',
                      })
                    } catch {
                      /* already registered — OTP re-sent anyway */
                    }
                  }}
                >
                  Resend OTP
                </button>
              </form>
            )}

            {/* ── Step 3: Organisation Profile ─────────────────────── */}
            {step === 2 && (
              <form
                onSubmit={orgForm.handleSubmit(submitOrg)}
                className="space-y-4"
              >
                <FormInput
                  label="Legal Name"
                  required
                  placeholder="Registered name of your organisation"
                  error={orgForm.formState.errors.legal_name?.message}
                  {...orgForm.register('legal_name')}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormSelect
                    label="Organisation Type"
                    required
                    options={ORG_TYPES}
                    placeholder="Select type"
                    error={orgForm.formState.errors.org_type?.message}
                    {...orgForm.register('org_type')}
                  />
                  <FormInput
                    label="Year Established"
                    type="number"
                    placeholder="e.g. 2010"
                    error={
                      orgForm.formState.errors.year_established?.message
                    }
                    {...orgForm.register('year_established')}
                  />
                </div>

                <FormInput
                  label="Registration Number"
                  placeholder="e.g. MH2019NGO12345"
                  hint="Alphanumeric, 5-20 characters"
                  error={
                    orgForm.formState.errors.registration_number?.message
                  }
                  {...orgForm.register('registration_number')}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormSelect
                    label="State"
                    options={STATES.map((s) => ({ value: s, label: s }))}
                    placeholder="Select state"
                    error={orgForm.formState.errors.state?.message}
                    {...orgForm.register('state')}
                  />
                  <FormInput
                    label="Annual Budget (INR)"
                    type="number"
                    placeholder="e.g. 5000000"
                    error={
                      orgForm.formState.errors.annual_budget_inr?.message
                    }
                    {...orgForm.register('annual_budget_inr')}
                  />
                </div>

                <FormInput
                  label="Contact Person"
                  placeholder="Primary contact name"
                  error={orgForm.formState.errors.contact_person?.message}
                  {...orgForm.register('contact_person')}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary mt-2 w-full"
                >
                  {loading ? 'Saving profile...' : 'Complete Registration'}
                </button>

                <button
                  type="button"
                  className="btn-ghost w-full text-sm"
                  onClick={() =>
                    navigate('/login', { state: { registered: true } })
                  }
                >
                  Skip for now — complete later
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
