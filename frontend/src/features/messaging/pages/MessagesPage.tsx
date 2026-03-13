import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { StatusPill } from '@/shared/components/StatusPill'

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

interface ApplicationShort {
  id: string
  reference_number: string
  programme_name: string
  status: string
}

function formatMsgTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} ${hours}:${mins}`
}

export function MessagesPage() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isApplicant = user?.role === 'applicant'
  const isStaff = !isApplicant

  const [messages, setMessages] = useState<MessageItem[]>([])
  const [apps, setApps] = useState<ApplicationShort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [replyBody, setReplyBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (appId) {
        const res = await apiClient.get(`/v1/messaging/messages/${appId}`)
        setMessages(res.data)
      } else {
        const endpoint = isApplicant ? '/v1/applications' : '/v1/staff/applications'
        const res = await apiClient.get(endpoint)
        setApps(res.data)
      }
    } catch {
      setError('Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [appId, isApplicant])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (appId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, appId])

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
      // Re-fetch messages
      const res = await apiClient.get(`/v1/messaging/messages/${appId}`)
      setMessages(res.data)
    } catch {
      setError('Failed to send message.')
    } finally {
      setSending(false)
    }
  }, [replyBody, isInternal, appId])

  if (!appId) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Messages" breadcrumbs={[{ label: 'Messages' }]} />

        {loading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner label="Loading applications..." />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-body text-sm text-bark mb-6">
              Select an application thread to view messages and communicate with the committee.
            </p>

            {apps.length === 0 ? (
              <SectionCard>
                <div className="py-12 text-center">
                  <p className="font-body text-sm text-sand">No active application threads found.</p>
                </div>
              </SectionCard>
            ) : (
              <div className="grid gap-4">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => navigate(`${isStaff ? '/staff' : ''}/messages/${app.id}`)}
                    className="flex w-full items-center justify-between rounded-lg border border-sand bg-white p-4 transition-all hover:border-clay hover:shadow-md text-left"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-xs font-bold text-soil">{app.reference_number}</span>
                        <StatusPill status={app.status} />
                      </div>
                      <h3 className="font-body text-sm font-semibold text-bark">{app.programme_name}</h3>
                    </div>
                    <div className="text-clay">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
          { label: 'Messages', href: isStaff ? '/staff/messages' : '/messages' },
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
