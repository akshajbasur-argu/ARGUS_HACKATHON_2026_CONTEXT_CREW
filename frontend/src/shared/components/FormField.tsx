import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/utils/cn'

/* ── Shared props ──────────────────────────────────────────────────────────── */

interface BaseFieldProps {
  label: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
}

/* ── Input ─────────────────────────────────────────────────────────────────── */

type InputProps = BaseFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>

export const FormInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, className, id, ...rest }, ref) => {
    const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={fieldId}
          className="font-body text-sm font-medium text-bark"
        >
          {label}
          {required && <span className="ml-0.5 text-rust">*</span>}
        </label>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          className={cn(
            'rounded-md border bg-cream px-3 py-2 font-body text-sm text-soil',
            'placeholder:text-sand',
            'transition-shadow focus:outline-none focus:ring-[3px]',
            error
              ? 'border-rust focus:ring-rust/30'
              : 'border-sand focus:border-clay focus:ring-clay/30',
          )}
          {...rest}
        />
        {hint && !error && (
          <p className="font-body text-xs text-sand">{hint}</p>
        )}
        {error && (
          <p id={`${fieldId}-err`} className="font-body text-xs text-rust" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
FormInput.displayName = 'FormInput'

/* ── Textarea ──────────────────────────────────────────────────────────────── */

type TextareaProps = BaseFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

export const FormTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, className, id, ...rest }, ref) => {
    const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={fieldId}
          className="font-body text-sm font-medium text-bark"
        >
          {label}
          {required && <span className="ml-0.5 text-rust">*</span>}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          rows={4}
          className={cn(
            'rounded-md border bg-cream px-3 py-2 font-body text-sm text-soil',
            'placeholder:text-sand resize-y',
            'transition-shadow focus:outline-none focus:ring-[3px]',
            error
              ? 'border-rust focus:ring-rust/30'
              : 'border-sand focus:border-clay focus:ring-clay/30',
          )}
          {...rest}
        />
        {hint && !error && (
          <p className="font-body text-xs text-sand">{hint}</p>
        )}
        {error && (
          <p id={`${fieldId}-err`} className="font-body text-xs text-rust" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
FormTextarea.displayName = 'FormTextarea'

/* ── Select ────────────────────────────────────────────────────────────────── */

interface SelectOption {
  value: string
  label: string
}

type SelectProps = BaseFieldProps &
  Omit<InputHTMLAttributes<HTMLSelectElement>, 'className'> & {
    options: SelectOption[]
    placeholder?: string
  }

export const FormSelect = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, required, className, id, options, placeholder, ...rest }, ref) => {
    const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={fieldId}
          className="font-body text-sm font-medium text-bark"
        >
          {label}
          {required && <span className="ml-0.5 text-rust">*</span>}
        </label>
        <select
          ref={ref as React.Ref<HTMLSelectElement>}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          className={cn(
            'rounded-md border bg-cream px-3 py-2 font-body text-sm text-soil',
            'transition-shadow focus:outline-none focus:ring-[3px]',
            error
              ? 'border-rust focus:ring-rust/30'
              : 'border-sand focus:border-clay focus:ring-clay/30',
          )}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hint && !error && (
          <p className="font-body text-xs text-sand">{hint}</p>
        )}
        {error && (
          <p id={`${fieldId}-err`} className="font-body text-xs text-rust" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
FormSelect.displayName = 'FormSelect'
