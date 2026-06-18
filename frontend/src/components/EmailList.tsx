import { useAppStore } from '../store'
import { useEmails } from '../queries'
import type { Email } from '../queries'

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function EmailSkeleton() {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="skeleton" style={{ width: '40%', height: 13 }} />
        <div className="skeleton" style={{ width: 40, height: 11 }} />
      </div>
      <div className="skeleton" style={{ width: '80%', height: 12, marginBottom: 4 }} />
      <div className="skeleton" style={{ width: '60%', height: 11 }} />
    </div>
  )
}

export default function EmailList() {
  const accountId = useAppStore((s) => s.selectedAccountId)
  const folder = useAppStore((s) => s.selectedFolder)
  const selectedEmailId = useAppStore((s) => s.selectedEmailId)
  const setEmail = useAppStore((s) => s.setEmail)

  const { data: emails, isLoading, isError } = useEmails(accountId, folder)

  return (
    <div className="email-list" id="email-list">
      {/* Header */}
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-elevated)',
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize', margin: 0, letterSpacing: '-0.01em' }}>
          {folder}
        </h2>
        {emails && emails.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: '2px 7px', borderRadius: 'var(--radius-full)',
            background: 'var(--accent-subtle)', color: 'var(--accent-light)',
            border: '1px solid var(--border-accent)',
          }}>
            {emails.length}
          </span>
        )}
      </div>

      {/* Email items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && (
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <EmailSkeleton key={i} />
            ))}
          </>
        )}

        {isError && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            Failed to load emails
          </div>
        )}

        {!isLoading && emails && emails.length === 0 && (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{ opacity: 0.25 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                {folder === 'trash' ? (
                  <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>
                ) : folder === 'sent' ? (
                  <><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></>
                ) : folder === 'drafts' ? (
                  <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>
                ) : (
                  <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>
                )}
              </svg>
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>
              {folder === 'inbox' ? 'Inbox is empty' : `No ${folder} emails`}
            </p>
            {folder === 'inbox' && (
              <p style={{ fontSize: 11, color: 'var(--text-disabled)', lineHeight: 1.5 }}>
                New emails will appear here
              </p>
            )}
          </div>
        )}

        {emails?.map((email, idx) => (
          <EmailItem
            key={email.id}
            email={email}
            isActive={email.id === selectedEmailId}
            onClick={() => setEmail(email.id)}
            animationDelay={idx * 0.03}
          />
        ))}
      </div>
    </div>
  )
}

interface EmailItemProps {
  email: Email
  isActive: boolean
  onClick: () => void
  animationDelay: number
}

function EmailItem({ email, isActive, onClick, animationDelay }: EmailItemProps) {
  const isUnread = email.read_status === 0 && email.direction === 'inbound'
  const recipients = (() => {
    try {
      const arr = JSON.parse(email.recipient_to) as string[]
      return arr.join(', ')
    } catch {
      return email.recipient_to
    }
  })()

  const displayName = email.direction === 'inbound'
    ? (email.sender_name || email.sender_email)
    : `To: ${recipients}`

  return (
    <div
      id={`email-item-${email.id}`}
      className={`email-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}`}
      onClick={onClick}
      style={{ animationDelay: `${animationDelay}s`, animation: 'fadeIn 0.25s var(--ease-out) both' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-selected={isActive}
      aria-label={`Email from ${displayName}: ${email.subject ?? '(no subject)'}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span className="email-sender" style={{ maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>
        <span className="email-time">{formatTime(email.created_at)}</span>
      </div>
      <div className="email-subject">{email.subject ?? '(no subject)'}</div>
      <div className="email-snippet">{email.body_text?.slice(0, 80) ?? ''}</div>
      {isUnread && <span className="unread-dot" aria-hidden="true" />}
    </div>
  )
}
