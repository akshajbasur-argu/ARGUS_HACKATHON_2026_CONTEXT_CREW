import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/authStore'

interface MessageItem {
  id: string
  application_id: string
  sender_id: string
  sender_name: string
  sender_role: string
  body: string
  is_internal_note: boolean
  sent_at: string
}

function formatMsgTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} ${hours}:${mins}`
}

export function MessagesPage() {
  const { appId } = useParams<{ appId: string }>()
  const user = useAuthStore((s) => s.user)
  const isApplicant = user?.role === 'applicant'
  const isStaff = !isApplicant

  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [replyBody, setReplyBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async () => {
    if (!appId) return
    setLoading(true)
    try {
      const res = await apiClient.get(`/v1/messaging/messages/${appId}`)
      setMessages(res.data)
    } catch {
      setError('Failed to load messages.')
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!replyBody.trim() || !appId) return
    setSending(true)
    setError('')
    try {
      await apiClient.post(`/v1/messaging/messages/${appId}`, {
        body: replyBody.trim(),
        is_internal_note: isInternal,
      })
      setReplyBody('')
      setIsInternal(false)
      await fetchMessages()
    } catch {
      setError('Failed to send message.')
    } finally {
      setSending(false)
    }
  }, [replyBody, isInternal, appId, fetchMessages])

  if (!appId) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Messages" breadcrumbs={[{ label: 'Messages' }]} />
        <p className="font-body text-sm text-bark">Select an application to view messages.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-12">
        <LoadingSpinner label="Loading messages..." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Message Thread"
        breadcrumbs={[
          { label: 'Messages', href: '/messages' },
          { label: `Application ${appId.slice(0, 8)}...` },
        ]}
      />

      {error && (
        <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{error}</p>
        </div>
      )}

      {/* Chat thread */}
      <SectionCard>
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
          {messages.length === 0 && (
            <p className="py-8 text-center font-body text-sm text-sand">
              No messages yet. Start the conversation below.
            </p>
          )}

          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id
            const isNote = msg.is_internal_note

            return (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col',
                  isMine ? 'items-end' : 'items-start',
                )}
              >
                {/* Sender label */}
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-body text-xs font-medium text-bark">
                    {msg.sender_name}
                  </span>
                  <span className="font-mono text-[10px] text-sand">
                    {msg.sender_role.replace(/_/g, ' ')}
                  </span>
                  {isNote && (
                    <span className="rounded-sm bg-soil px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gold">
                      Staff only
                    </span>
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-3',
                    isNote
                      ? 'bg-soil text-gold border border-bark/30'
                      : msg.sender_role === 'applicant'
                        ? 'bg-clay text-cream'
                        : 'bg-parchment text-soil border border-sand',
                  )}
                >
                  <p className="font-body text-sm whitespace-pre-wrap">{msg.body}</p>
                </div>

                {/* Timestamp */}
                <span className="mt-1 font-mono text-[10px] text-sand">
                  {formatMsgTime(msg.sent_at)}
                </span>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </SectionCard>

      {/* Reply area */}
      <div className="mt-4 space-y-3">
        {isStaff && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsInternal(!isInternal)}
              className={cn(
                'rounded-md px-3 py-1.5 font-body text-xs font-medium transition-colors',
                isInternal
                  ? 'bg-soil text-gold'
                  : 'bg-parchment text-bark border border-sand hover:bg-sand/30',
              )}
            >
              {isInternal ? 'Internal Note' : 'Add Internal Note'}
            </button>
            {isInternal && (
              <span className="font-body text-xs text-bark">
                This note will only be visible to staff members.
              </span>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={isInternal ? 'Write an internal note...' : 'Write a message...'}
            rows={3}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 font-body text-sm text-soil',
              'placeholder:text-sand resize-none',
              'transition-shadow focus:outline-none focus:ring-[3px]',
              isInternal
                ? 'border-bark bg-soil/5 focus:border-bark focus:ring-bark/20'
                : 'border-sand bg-cream focus:border-clay focus:ring-clay/30',
            )}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !replyBody.trim()}
              className={cn(
                'rounded-md px-5 py-2 font-body text-sm font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                isInternal
                  ? 'bg-soil text-gold hover:bg-bark'
                  : 'bg-clay text-cream hover:bg-bark',
              )}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
