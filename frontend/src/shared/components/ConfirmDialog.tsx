import { Modal } from './Modal'
import { cn } from '@/shared/utils/cn'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
}

const VARIANT_STYLES = {
  danger:  'bg-rust text-cream hover:bg-rust/90',
  warning: 'bg-amber text-cream hover:bg-amber/90',
  default: 'bg-clay text-cream hover:bg-bark',
} as const

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="sm">
      <p className="mb-6 font-body text-sm text-bark leading-relaxed">
        {message}
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className={cn(
            'rounded-md border border-sand bg-cream px-4 py-2',
            'font-body text-sm font-medium text-bark',
            'transition-colors hover:bg-parchment',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'rounded-md px-4 py-2',
            'font-body text-sm font-medium',
            'transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-60',
            VARIANT_STYLES[variant],
          )}
        >
          {loading ? 'Please wait\u2026' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
