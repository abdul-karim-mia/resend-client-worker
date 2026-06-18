import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store'
import { useSendEmail, useQuickReplySuggestions } from '../queries'

interface Email {
  id: string
  subject: string | null
  sender_email: string
  account_id: string
  thread_id: string
}

interface QuickReplyProps {
  email: Email
  accountId: string
}

export default function QuickReply({ email, accountId }: QuickReplyProps) {
  const openComposer = useAppStore((s) => s.openComposer)
  const addToast = useAppStore((s) => s.addToast)
  const sendEmail = useSendEmail()

  // Hold the mutation in a ref so the useEffect never captures a stale closure.
  // useMutation returns a stable object but accessing it via ref avoids the
  // eslint exhaustive-deps warning without suppressing lint.
  const getAISuggestions = useQuickReplySuggestions()
  const getAISuggestionsRef = useRef(getAISuggestions)
  useEffect(() => { getAISuggestionsRef.current = getAISuggestions })

  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState<string | null>(null) // which chip is sending

  // Fetch AI suggestions whenever the selected email changes
  useEffect(() => {
    if (!email?.id || !accountId) return

    // Reset state for new email
    setSuggestions([])
    setLoading(true)

    getAISuggestionsRef.current.mutate(
      { emailId: email.id, accountId },
      {
        onSuccess: (data) => {
          setSuggestions(data.suggestions ?? [])
          setLoading(false)
        },
        onError: () => {
          // Graceful fallback — always show something clickable
          setSuggestions(['Thanks!', 'Got it.', "I'll look into this."])
          setLoading(false)
        },
      }
    )
  }, [email.id, accountId])

  // Send a quick-reply chip text directly
  const handleChipSend = useCallback(async (text: string) => {
    setSending(text)
    try {
      await sendEmail.mutateAsync({
        accountId,
        to: [email.sender_email],
        subject: email.subject
          ? (email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`)
          : 'Re: (no subject)',
        html: `<p>${text}</p>`,
        replyToEmailId: email.id,
      })
      addToast('Quick reply sent', 'success')
    } catch {
      addToast('Failed to send quick reply', 'error')
    } finally {
      setSending(null)
    }
  }, [accountId, email, sendEmail, addToast])

  // Open the full Composer pre-filled with the chip's text so the user can
  // edit before sending (pencil / "Edit" button on each chip)
  const handleChipEdit = useCallback((text: string) => {
    // We open the composer in reply mode — the Composer will pre-fill To + Subject
    // from the parent email. We store the suggestion text in sessionStorage so
    // Composer can pick it up as the initial body.
    sessionStorage.setItem('composer:prefill', text)
    openComposer(email.id)
  }, [email.id, openComposer])

  return (
    <div style={{
      padding: '10px 16px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2.5">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Quick reply</span>
      </div>

      {loading ? (
        // Skeleton chips while AI generates
        <>
          {[80, 60, 100].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ width: w, height: 28, borderRadius: 'var(--radius-full)' }}
            />
          ))}
        </>
      ) : (
        suggestions.map((s, i) => (
          // Each chip is a pair: [Send instantly] + [✏ Edit before sending]
          <div
            key={i}
            style={{
              display: 'inline-flex', alignItems: 'center',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border)',
              background: sending === s ? 'var(--accent-muted)' : 'var(--bg-overlay)',
              overflow: 'hidden',
              opacity: sending !== null && sending !== s ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!sending) {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)'
                ;(e.currentTarget as HTMLDivElement).style.background = 'var(--accent-subtle)'
              }
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLDivElement).style.background =
                sending === s ? 'var(--accent-muted)' : 'var(--bg-overlay)'
            }}
          >
            {/* Send chip button */}
            <button
              id={`quick-reply-chip-${i}`}
              onClick={() => handleChipSend(s)}
              disabled={sending !== null}
              title="Send this reply"
              style={{
                padding: '5px 12px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 12,
                cursor: sending !== null ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {sending === s ? '…' : s}
            </button>

            {/* Edit-before-sending button (pencil) */}
            <button
              id={`quick-reply-edit-${i}`}
              onClick={() => handleChipEdit(s)}
              disabled={sending !== null}
              title="Edit before sending"
              style={{
                padding: '5px 8px 5px 4px',
                background: 'none',
                border: 'none',
                borderLeft: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: sending !== null ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-light)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
            >
              {/* Pencil icon */}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        ))
      )}

      {/* Full-compose button */}
      <button
        id="quick-reply-full"
        className="btn btn-ghost"
        onClick={() => openComposer(email.id)}
        style={{ fontSize: 12, marginLeft: 'auto', padding: '5px 12px' }}
      >
        Full Reply ↩
      </button>
    </div>
  )
}
