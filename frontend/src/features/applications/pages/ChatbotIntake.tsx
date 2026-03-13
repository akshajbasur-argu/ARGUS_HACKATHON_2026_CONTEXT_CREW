import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface FieldCapture {
  field_name: string
  value: string | number | Record<string, unknown>
}

interface CapturedFieldItem {
  field_name: string
  label: string
  value: string | number | Record<string, unknown>
}

interface ChatResponse {
  assistant_message: string
  field_captured: FieldCapture | null
  next_field: string | null
  progress_pct: number
  complete: boolean
  captured_fields: CapturedFieldItem[]
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ChatbotIntake() {
  const { programmeId } = useParams<{ programmeId: string }>()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentField, setCurrentField] = useState<string | null>(null)
  const [capturedFields, setCapturedFields] = useState<CapturedFieldItem[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /* Auto-scroll to latest message */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* Start conversation on mount */
  useEffect(() => {
    if (programmeId) {
      sendToApi([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmeId])

  /* ── API call ───────────────────────────────────────────────────────── */

  const sendToApi = useCallback(
    async (conversationHistory: ChatMessage[]) => {
      if (!programmeId) return
      setIsLoading(true)
      setError(null)

      try {
        const { data } = await apiClient.post<ChatResponse>(
          '/v1/applications/chat',
          {
            programme_id: programmeId,
            conversation_history: conversationHistory,
            current_field: currentField,
          },
        )

        /* Append assistant message */
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.assistant_message,
        }
        setMessages((prev) => [...prev, assistantMsg])

        /* Update captured fields from server response */
        if (data.captured_fields && data.captured_fields.length > 0) {
          setCapturedFields(data.captured_fields)
        } else if (data.field_captured) {
          // Fallback: build from individual captures
          setCapturedFields((prev) => {
            const exists = prev.some((f) => f.field_name === data.field_captured!.field_name)
            if (exists) {
              return prev.map((f) =>
                f.field_name === data.field_captured!.field_name
                  ? { ...f, value: data.field_captured!.value }
                  : f,
              )
            }
            return [
              ...prev,
              {
                field_name: data.field_captured!.field_name,
                label: data.field_captured!.field_name.replace(/_/g, ' '),
                value: data.field_captured!.value,
              },
            ]
          })
        }

        setProgress(data.progress_pct)
        setCurrentField(data.next_field)
        setIsComplete(data.complete)
      } catch {
        setError('Failed to get a response. Please try again.')
      } finally {
        setIsLoading(false)
      }
    },
    [programmeId, currentField],
  )

  /* ── Send user message ──────────────────────────────────────────────── */

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setInput('')

    await sendToApi(updatedHistory)
  }, [input, isLoading, messages, sendToApi])

  /* Enter key sends (Shift+Enter for newline) */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        title="AI-Guided Application"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'New Application' },
        ]}
        action={
          <button
            onClick={() => navigate(`/apply/${programmeId}`)}
            className="btn-secondary text-sm"
          >
            Switch to Form Wizard
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* ── Chat Panel (70%) ──────────────────────────────────────── */}
        <div className="flex w-[70%] flex-col rounded-lg border border-sand bg-white shadow-card">
          {/* "Switch to form wizard" link at top-right */}
          <div className="flex items-center justify-end border-b border-sand px-4 py-2">
            <button
              onClick={() => navigate(`/apply/${programmeId}`)}
              className="font-body text-xs text-clay hover:text-bark hover:underline"
            >
              Switch to form wizard &rarr;
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && !isLoading && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-sand font-body">
                  Starting your guided application...
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-3 text-sm font-body leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-br-md bg-clay text-cream'
                      : 'rounded-bl-md bg-parchment text-bark border border-sand/50',
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-sand/50 bg-parchment px-4 py-3">
                  <div className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span className="text-xs text-sand font-body">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="rounded-lg bg-rust/10 px-4 py-2 text-xs text-rust font-body">
                  {error}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-sand p-4">
            {isComplete ? (
              <div className="flex items-center justify-between rounded-lg bg-moss/10 border border-moss/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-moss" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-body text-moss font-medium">
                    All fields collected!
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/apply/${programmeId}`, { state: { startStep: 5 } })}
                  className="btn-primary text-sm"
                >
                  Review &amp; Submit
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your response..."
                  disabled={isLoading}
                  rows={1}
                  className={cn(
                    'flex-1 resize-none rounded-xl border border-sand bg-parchment/30 px-4 py-3',
                    'font-body text-sm text-bark placeholder:text-sand',
                    'focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/20',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'max-h-32 min-h-[2.75rem]',
                  )}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 128) + 'px'
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    'bg-soil text-cream transition-colors',
                    'hover:bg-bark disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                  aria-label="Send message"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel (30%): Fields Captured ────────────────────── */}
        <div className="hidden w-[30%] shrink-0 flex-col rounded-lg border border-sand bg-white shadow-card lg:flex">
          {/* Header */}
          <div className="border-b border-sand px-4 py-3">
            <h3 className="font-heading text-sm font-semibold text-soil">
              Fields Captured
            </h3>
            <p className="mt-0.5 font-mono text-xs text-sand">
              {capturedFields.length} field{capturedFields.length !== 1 ? 's' : ''} captured
            </p>
          </div>

          {/* Progress bar */}
          <div className="border-b border-sand px-4 py-3">
            <div className="mb-1 flex items-center justify-between text-xs font-body text-bark">
              <span>Progress</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-parchment">
              <div
                className="h-full rounded-full bg-clay transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Scrollable field pills */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {capturedFields.length === 0 ? (
              <p className="py-8 text-center text-xs text-sand font-body">
                Fields will appear here as they are captured during the conversation.
              </p>
            ) : (
              capturedFields.map((field) => (
                <div
                  key={field.field_name}
                  className="rounded-lg border border-clay/30 bg-straw px-3 py-2"
                >
                  <span className="block font-mono text-[10px] font-medium uppercase tracking-wider text-clay">
                    {field.label}
                  </span>
                  <span className="mt-0.5 block truncate font-body text-xs text-bark">
                    {typeof field.value === 'string'
                      ? field.value.length > 100
                        ? field.value.slice(0, 100) + '...'
                        : field.value
                      : JSON.stringify(field.value)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Current field indicator */}
          {currentField && !isComplete && (
            <div className="border-t border-sand px-4 py-3">
              <span className="block font-mono text-[10px] font-medium uppercase tracking-wider text-sand">
                Currently collecting
              </span>
              <span className="mt-0.5 block font-body text-sm font-medium text-soil">
                {currentField.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          {/* Completion indicator */}
          {isComplete && (
            <div className="border-t border-moss/30 bg-moss/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-moss" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-body text-sm font-medium text-moss">
                  All fields collected!
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
