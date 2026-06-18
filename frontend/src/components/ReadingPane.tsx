import { useAppStore } from '../store'
import { useEmail, useMoveFolder, useMarkRead } from '../queries'
import SafeEmailViewer from './SafeEmailViewer'
import QuickReply from './QuickReply'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function ReadingPane() {
  const emailId = useAppStore((s) => s.selectedEmailId)
  const openComposer = useAppStore((s) => s.openComposer)
  const addToast = useAppStore((s) => s.addToast)
  const selectedAccountId = useAppStore((s) => s.selectedAccountId)
  const moveFolder = useMoveFolder()
  const markRead = useMarkRead()

  const { data: email, isLoading } = useEmail(emailId)

  if (!emailId) {
    return (
      <div className="reading-pane" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: 0.35 }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 500 }}>Select an email to read</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            or press <kbd style={{ padding: '1px 5px', background: 'var(--bg-elevated)', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11 }}>C</kbd> to compose
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="reading-pane">
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
          <div className="skeleton" style={{ width: '60%', height: 22, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: '40%', height: 14, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: '30%', height: 12 }} />
        </div>
        <div style={{ padding: 24 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: `${85 - i * 5}%`, height: 14, marginBottom: 10 }} />
          ))}
        </div>
      </div>
    )
  }

  if (!email) return null

  const handleArchive = async () => {
    await moveFolder.mutateAsync({ emailId: email.id, folder: 'archive' })
    addToast('Archived', 'success', {
      label: 'Undo',
      onClick: () => moveFolder.mutate({ emailId: email.id, folder: 'inbox' }),
    })
  }

  const handleTrash = async () => {
    await moveFolder.mutateAsync({ emailId: email.id, folder: 'trash' })
    addToast('Moved to trash', 'success', {
      label: 'Undo',
      onClick: () => moveFolder.mutate({ emailId: email.id, folder: 'inbox' }),
    })
  }

  const handleDownloadAttachment = (attId: string, filename: string) => {
    // Backend streams the file directly — just navigate to the URL
    const a = document.createElement('a')
    a.href = `/api/attachments/${attId}/download`
    a.download = filename
    a.click()
  }

  const recipients = (() => {
    try { return (JSON.parse(email.recipient_to) as string[]).join(', ') } catch { return email.recipient_to }
  })()

  return (
    <div className="reading-pane">
      {/* Action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexWrap: 'wrap',
      }}>
        <button id="action-reply" className="btn btn-ghost" style={{ fontSize: 12, gap: 6 }} onClick={() => openComposer(email.id)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          Reply
        </button>
        <button id="action-forward" className="btn btn-ghost" style={{ fontSize: 12, gap: 6 }} onClick={() => openComposer()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
          Forward
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button id="action-archive" className="btn btn-ghost" style={{ fontSize: 12, gap: 6 }} onClick={handleArchive}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
          Archive
        </button>
        <button id="action-trash" className="btn btn-ghost" style={{ fontSize: 12, gap: 6, color: 'var(--text-muted)' }} onClick={handleTrash}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Trash
        </button>
        <button
          id="action-read-toggle"
          className="btn btn-ghost"
          style={{ fontSize: 12, gap: 6, marginLeft: 'auto' }}
          onClick={() => markRead.mutate({ emailId: email.id, read: email.read_status === 0 })}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={email.read_status === 1 ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="6"/></svg>
          {email.read_status === 1 ? 'Mark unread' : 'Mark read'}
        </button>
      </div>

      {/* Email header */}
      <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 14, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
          {email.subject ?? '(no subject)'}
        </h1>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `hsl(${(email.sender_email?.charCodeAt(0) ?? 0) * 17 % 360}deg 55% 38%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            {(email.sender_name || email.sender_email).slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {email.sender_name || email.sender_email}
                </span>
                {email.sender_name && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                    &lt;{email.sender_email}&gt;
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {formatDate(email.created_at)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipients}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {email.body_html ? (
          <SafeEmailViewer html={email.body_html} />
        ) : (
          <div style={{ padding: '24px 32px' }}>
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)',
              fontFamily: 'inherit', margin: 0,
            }}>
              {email.body_text ?? '(no content)'}
            </pre>
          </div>
        )}
      </div>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {email.attachments.map((att) => (
            <button
              key={att.id}
              id={`attachment-${att.id}`}
              onClick={() => handleDownloadAttachment(att.id, att.filename)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer', color: 'var(--text-primary)',
                fontSize: 12, fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = 'var(--accent-subtle)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
            >
              📎 {att.filename}
              {att.size_bytes ? <span style={{ color: 'var(--text-muted)' }}>{formatBytes(att.size_bytes)}</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* Quick Reply — AI-generated suggestions */}
      {email.direction !== 'outbound' && selectedAccountId && (
        <QuickReply
          email={{
            id: email.id,
            subject: email.subject ?? null,
            sender_email: email.sender_email,
            account_id: email.account_id,
            thread_id: email.thread_id,
          }}
          accountId={selectedAccountId}
        />
      )}
    </div>
  )
}
