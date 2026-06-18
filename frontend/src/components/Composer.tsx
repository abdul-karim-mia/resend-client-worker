import { useState, useEffect, useRef, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useAppStore } from '../store'
import {
  useSendEmail, useAIAdjustTone, useAIDraftReply, useAICustomPrompt,
  useResendTemplates, useResendTemplate, useAccounts, useAllSenders,
  useEmail, useSaveDraft,
} from '../queries'

interface ComposerProps {
  accountId: string
  replyToEmailId?: string | null
}

export default function Composer({ accountId: defaultAccountId, replyToEmailId }: ComposerProps) {
  const close = useAppStore((s) => s.closeComposer)
  const addToast = useAppStore((s) => s.addToast)
  const sendEmail = useSendEmail()
  const adjustTone = useAIAdjustTone()
  const aiCustomPrompt = useAICustomPrompt()
  const aiDraft = useAIDraftReply()
  const saveDraft = useSaveDraft()

  // Account + sender selector
  const { data: accounts = [] } = useAccounts()
  const { data: allSenders = [] } = useAllSenders(accounts)
  const [fromAccountId, setFromAccountId] = useState(defaultAccountId)
  // selectedSenderKey = "accountId::name::email" composite key
  const [selectedSenderKey, setSelectedSenderKey] = useState<string>('')

  // Derive actual sender info from the selected key
  const parseSenderKey = (key: string) => {
    const [accId, name, email] = key.split('::')
    return { accountId: accId, senderName: name, senderEmail: email }
  }

  // Auto-select default sender when senders load
  useEffect(() => {
    if (!selectedSenderKey && allSenders.length > 0) {
      const accountSenders = allSenders.filter((s) => s.account_id === fromAccountId)
      const def = accountSenders.find((s) => s.is_default === 1) ?? accountSenders[0]
      if (def) {
        setSelectedSenderKey(`${def.account_id}::${def.name}::${def.email}`)
      }
    }
  }, [allSenders, fromAccountId, selectedSenderKey])

  // ── Fields ────────────────────────────────────────────────────────────────
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [sending, setSending] = useState(false)

  // Draft tracking
  const [draftId, setDraftId] = useState<string | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasContentRef = useRef(false)

  // Attachments
  const [attachedFiles, setAttachedFiles] = useState<Array<{ key: string; filename: string }>>([])

  // Template
  const [templateMode, setTemplateMode] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({})

  // AI panel
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiOutput, setAiOutput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Resend templates
  const { data: resendTemplates = [] } = useResendTemplates(fromAccountId)
  const { data: templateDetail } = useResendTemplate(fromAccountId, selectedTemplateId)

  // Editor ref (contenteditable)
  const editorRef = useRef<HTMLDivElement>(null)

  // ── Fetch parent email for reply quoting ─────────────────────────────────
  const { data: parentEmail } = useEmail(replyToEmailId ?? null)

  // Pick up pre-filled text from QuickReply "Edit" chip (stored in sessionStorage)
  useEffect(() => {
    const prefill = sessionStorage.getItem('composer:prefill')
    if (prefill && editorRef.current) {
      sessionStorage.removeItem('composer:prefill')
      editorRef.current.innerHTML = `<p>${prefill.replace(/\n/g, '<br>')}</p>`
    }
  // Only run on initial mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initialize editor HTML — set once on mount (avoids dangerouslySetInnerHTML + state conflict)
  useEffect(() => {
    if (!editorRef.current) return
    if (replyToEmailId && parentEmail) {
      // Gmail-style reply quoting: cursor at top, quoted original below
      const senderDisplay = parentEmail.sender_name
        ? `${parentEmail.sender_name} &lt;${parentEmail.sender_email}&gt;`
        : parentEmail.sender_email
      const dateStr = new Date(parentEmail.created_at).toLocaleString([], {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
      // Use plain text body if no HTML, strip scripts from HTML if present
      const quotedContent = parentEmail.body_html
        ? parentEmail.body_html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        : (parentEmail.body_text ?? '').replace(/\n/g, '<br>')

      editorRef.current.innerHTML = `<p><br></p><div style="border-left:3px solid var(--border-hover,#555);padding-left:14px;margin:8px 0;color:var(--text-muted)"><p style="font-size:12px;margin-bottom:8px"><strong>On ${dateStr}, ${senderDisplay} wrote:</strong></p>${quotedContent}</div>`
    } else if (!replyToEmailId) {
      editorRef.current.innerHTML = ''
    }
    // Place cursor at the very beginning
    const range = document.createRange()
    const sel = window.getSelection()
    range.setStart(editorRef.current, 0)
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
    editorRef.current.focus()
  // Only re-run when parentEmail loads (avoid re-init on every keystroke)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentEmail, replyToEmailId])

  // Auto-fill subject for replies
  useEffect(() => {
    if (replyToEmailId && parentEmail && !subject) {
      const raw = parentEmail.subject ?? ''
      setSubject(raw.startsWith('Re:') ? raw : `Re: ${raw}`)
    }
    if (replyToEmailId && parentEmail && !to) {
      setTo(parentEmail.sender_email)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentEmail, replyToEmailId])

  // Auto-fill from template
  useEffect(() => {
    if (!templateDetail) return
    if (templateDetail.subject) setSubject(templateDetail.subject)
    const vars: Record<string, string> = {}
    templateDetail.variables?.forEach((v) => { vars[v.key] = '' })
    setTemplateVars(vars)
  }, [templateDetail])

  // ── Draft auto-save (30s debounce on content change) ─────────────────────
  const scheduleDraftSave = useCallback(() => {
    if (templateMode) return // Don't auto-save template mode
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(async () => {
      const html = editorRef.current?.innerHTML ?? ''
      if (!html || html === '<br>') return
      hasContentRef.current = true
      try {
        const result = await saveDraft.mutateAsync({
          accountId: fromAccountId,
          to: to ? to.split(',').map((t) => t.trim()).filter(Boolean) : [],
          subject: subject || undefined,
          html,
          existingDraftId: draftId ?? undefined,
        })
        if (!draftId) setDraftId(result.id)
      } catch {
        // Silent — draft save failures should not disrupt the user
      }
    }, 30_000)
  }, [templateMode, fromAccountId, to, subject, draftId, saveDraft])

  // Track content changes for hasContentRef
  const handleEditorInput = useCallback(() => {
    hasContentRef.current = !!(editorRef.current?.innerText?.trim())
    scheduleDraftSave()
  }, [scheduleDraftSave])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  // ── Close with "Save draft?" guard ───────────────────────────────────────
  const handleClose = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    const html = editorRef.current?.innerHTML ?? ''
    const hasBody = !!(html && html !== '<br>' && editorRef.current?.innerText?.trim())

    if (hasBody && !draftId) {
      // Ask user — Save draft or discard?
      if (window.confirm('Save this email as a draft?')) {
        saveDraft.mutate({
          accountId: fromAccountId,
          to: to ? to.split(',').map((t) => t.trim()).filter(Boolean) : [],
          subject: subject || undefined,
          html,
        })
      }
    }
    close()
  }, [close, draftId, fromAccountId, to, subject, saveDraft])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleClose])

  // ── Image upload / drag-drop ──────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    onDrop: async (files) => {
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          addToast(`${file.name} exceeds 25MB`, 'error')
          continue
        }
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(`/api/attachments/upload?accountId=${fromAccountId}`, {
          method: 'POST', credentials: 'include', body: form,
        })
        const data = await res.json() as { success: boolean; data: { key: string; filename: string; url?: string } }
        if (data.success) {
          if (file.type.startsWith('image/') && editorRef.current) {
            // Embed inline image
            const url = `/api/attachments/${data.data.key}/download`
            document.execCommand('insertHTML', false,
              `<img src="${url}" alt="${data.data.filename}" style="max-width:100%;height:auto;border-radius:4px;margin:8px 0" />`)
          }
          setAttachedFiles((p) => [...p, { key: data.data.key, filename: data.data.filename }])
        }
      }
    },
  })

  const getEditorHtml = () => editorRef.current?.innerHTML ?? ''

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!to || !subject) return
    setSending(true)
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)

    const parsed = selectedSenderKey ? parseSenderKey(selectedSenderKey) : null
    const resolvedAccountId = parsed?.accountId ?? fromAccountId
    const resolvedSenderName = parsed?.senderName
    const resolvedSenderEmail = parsed?.senderEmail

    try {
      if (templateMode && selectedTemplateId) {
        await sendEmail.mutateAsync({
          accountId: resolvedAccountId,
          to: to.split(',').map((t) => t.trim()).filter(Boolean),
          cc: cc ? cc.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          bcc: bcc ? bcc.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          subject,
          templateId: selectedTemplateId,
          templateVariables: Object.fromEntries(Object.entries(templateVars).map(([k, v]) => [k, v])),
          replyToEmailId: replyToEmailId ?? undefined,
          senderName: resolvedSenderName,
          senderEmail: resolvedSenderEmail,
        })
      } else {
        const html = getEditorHtml()
        if (!html || html === '<br>') {
          addToast('Email body is empty', 'error')
          setSending(false)
          return
        }
        await sendEmail.mutateAsync({
          accountId: resolvedAccountId,
          to: to.split(',').map((t) => t.trim()).filter(Boolean),
          cc: cc ? cc.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          bcc: bcc ? bcc.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          subject,
          html,
          attachmentKeys: attachedFiles.map((f) => f.key),
          replyToEmailId: replyToEmailId ?? undefined,
          senderName: resolvedSenderName,
          senderEmail: resolvedSenderEmail,
        })
      }
      addToast('Email sent', 'success')
      close()
    } catch {
      addToast('Failed to send email', 'error')
    } finally {
      setSending(false)
    }
  }

  // ── AI — Tone adjustment ──────────────────────────────────────────────────
  const handleTone = async (tone: 'formal' | 'casual' | 'concise') => {
    const text = editorRef.current?.innerText ?? ''
    if (!text.trim()) {
      addToast('Write something first, then adjust the tone', 'info')
      return
    }
    try {
      setAiLoading(true)
      const result = await adjustTone.mutateAsync({ text, tone, accountId: fromAccountId })
      if (editorRef.current) editorRef.current.innerHTML = result.result.replace(/\n/g, '<br>')
    } catch {
      addToast('Tone adjustment failed', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI — Generate draft reply (reply mode) ────────────────────────────────
  const handleGenerateDraft = async () => {
    if (!replyToEmailId) return
    setAiLoading(true)
    try {
      const result = await aiDraft.mutateAsync(replyToEmailId)
      if (result.draft && editorRef.current) {
        // Insert draft above the quoted reply block
        const draft = result.draft.replace(/\n/g, '<br>')
        const currentHtml = editorRef.current.innerHTML
        // Find the blockquote/divider and place draft before it
        if (currentHtml.includes('border-left')) {
          const quoteStart = currentHtml.indexOf('<div style="border-left')
          editorRef.current.innerHTML =
            `<p>${draft}</p><br>` + currentHtml.slice(quoteStart)
        } else {
          editorRef.current.innerHTML = `<p>${draft}</p>`
        }
      }
    } catch {
      addToast('Failed to generate draft', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI — Custom free-form prompt ──────────────────────────────────────────
  const handleCustomAI = useCallback(async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    const bodyText = editorRef.current?.innerText ?? ''
    try {
      const result = await aiCustomPrompt.mutateAsync({
        text: bodyText,
        prompt: aiPrompt,
        accountId: fromAccountId,
      })
      if (result.result) setAiOutput(result.result)
    } catch {
      addToast('AI request failed', 'error')
    } finally {
      setAiLoading(false)
    }
  }, [aiPrompt, fromAccountId, addToast, aiCustomPrompt])

  const applyAiOutput = () => {
    if (editorRef.current && aiOutput) {
      editorRef.current.innerHTML = aiOutput.replace(/\n/g, '<br>')
      setAiOutput('')
      setAiPrompt('')
    }
  }

  const currentAccount = accounts.find((a) => a.id === fromAccountId)

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)', zIndex: 299,
          animation: 'fadeIn 0.15s ease',
        }}
        onClick={handleClose}
      />

      {/* Fullscreen modal */}
      <div
        style={{
          position: 'fixed', inset: '24px', zIndex: 300,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.2s var(--ease-spring)',
        }}
      >
        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {replyToEmailId ? '↩ Reply' : 'New Message'}
            </span>
            {draftId && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-overlay)', padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
                Draft saved
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '5px 12px', gap: 6 }}
              onClick={() => { setTemplateMode(!templateMode); setSelectedTemplateId(null) }}
              title="Toggle template mode"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {templateMode ? 'Template: ON' : 'Template'}
            </button>
            <button
              className="btn-icon btn"
              onClick={handleClose}
              aria-label="Close composer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Body: two columns */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* LEFT — Compose area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* Fields */}
            <div style={{ padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>

              {/* From */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>From</span>
                <select
                  value={selectedSenderKey}
                  onChange={(e) => {
                    setSelectedSenderKey(e.target.value)
                    const parsed = parseSenderKey(e.target.value)
                    if (parsed.accountId) setFromAccountId(parsed.accountId)
                  }}
                  style={{
                    flex: 1, background: 'transparent', border: 'none',
                    color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
                  }}
                  aria-label="From sender"
                >
                  {allSenders.length > 0 ? (
                    accounts.map((acc) => {
                      const senders = allSenders.filter((s) => s.account_id === acc.id)
                      if (senders.length === 0) return null
                      return (
                        <optgroup key={acc.id} label={acc.name} style={{ background: 'var(--bg-surface)' }}>
                          {senders.map((s) => (
                            <option
                              key={s.id}
                              value={`${s.account_id}::${s.name}::${s.email}`}
                              style={{ background: 'var(--bg-surface)' }}
                            >
                              {s.name} &lt;{s.email}&gt;{s.is_default ? ' ✓' : ''}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })
                  ) : (
                    accounts.map((acc) => (
                      <option key={acc.id} value={`${acc.id}::${acc.from_name}::${acc.from_email ?? `noreply@${acc.domain}`}`} style={{ background: 'var(--bg-surface)' }}>
                        {acc.from_name} &lt;{acc.from_email ?? `noreply@${acc.domain}`}&gt;
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* To */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>To</span>
                <input
                  type="text" value={to} onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com"
                  style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  aria-label="To"
                />
                <div style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => setShowCc(!showCc)} style={{ fontSize: 11, color: showCc ? 'var(--accent-light)' : 'var(--text-muted)', background: showCc ? 'var(--accent-subtle)' : 'none', border: '1px solid', borderColor: showCc ? 'var(--border-accent)' : 'transparent', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', transition: 'all 0.15s' }}>Cc</button>
                  <button onClick={() => setShowBcc(!showBcc)} style={{ fontSize: 11, color: showBcc ? 'var(--accent-light)' : 'var(--text-muted)', background: showBcc ? 'var(--accent-subtle)' : 'none', border: '1px solid', borderColor: showBcc ? 'var(--border-accent)' : 'transparent', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', transition: 'all 0.15s' }}>Bcc</button>
                </div>
              </div>

              {showCc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cc</span>
                  <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com"
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              )}

              {showBcc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bcc</span>
                  <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com"
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              )}

              {/* Subject */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: templateMode ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subject</span>
                <input
                  type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                  placeholder="Write a subject…"
                  style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'inherit' }}
                  aria-label="Subject"
                />
              </div>

              {/* Template picker */}
              {templateMode && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 40, flexShrink: 0 }}>Tmpl</span>
                    <select
                      value={selectedTemplateId ?? ''}
                      onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                      style={{
                        flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                        fontSize: 12, padding: '4px 8px', fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <option value="">— Select a Resend template —</option>
                      {resendTemplates.map((t) => (
                        <option key={t.id} value={t.id} style={{ background: 'var(--bg-surface)' }}>
                          {t.name} {t.status === 'draft' ? '(draft)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Variable inputs */}
                  {Object.keys(templateVars).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 48 }}>
                      {Object.keys(templateVars).map((key) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{`{{{${key}}}}`}</span>
                          <input
                            value={templateVars[key]}
                            onChange={(e) => setTemplateVars((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder={key}
                            style={{
                              width: 140, padding: '3px 8px',
                              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                              fontSize: 12, fontFamily: 'inherit', outline: 'none',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedTemplateId && resendTemplates.find(t => t.id === selectedTemplateId)?.status === 'draft' && (
                    <p style={{ fontSize: 11, color: 'var(--color-warning, #f59e0b)', paddingLeft: 48, marginTop: 4 }}>
                      ⚠ This template is a draft — publish it in Resend before sending
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Formatting toolbar (only in non-template mode) */}
            {!templateMode && (
              <div style={{ display: 'flex', gap: 2, padding: '4px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
                {[
                  { label: 'B', cmd: 'bold', title: 'Bold', style: { fontWeight: 700 } },
                  { label: 'I', cmd: 'italic', title: 'Italic', style: { fontStyle: 'italic' } },
                  { label: 'U', cmd: 'underline', title: 'Underline', style: { textDecoration: 'underline' } },
                  { label: '• List', cmd: 'insertUnorderedList', title: 'Bullet list', style: {} },
                  { label: '1. List', cmd: 'insertOrderedList', title: 'Numbered list', style: {} },
                  { label: '——', cmd: 'insertHorizontalRule', title: 'Divider', style: {} },
                ].map(({ label, cmd, title, style }) => (
                  <button
                    key={label}
                    onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd) }}
                    className="btn-icon btn"
                    title={title}
                    style={{ fontSize: 12, padding: '3px 7px', ...style }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const url = prompt('Link URL:')
                    if (url) document.execCommand('createLink', false, url)
                  }}
                  className="btn-icon btn"
                  title="Insert link"
                  style={{ fontSize: 12, padding: '3px 7px' }}
                >
                  🔗
                </button>
              </div>
            )}

            {/* Email body */}
            {!templateMode ? (
              <div
                {...getRootProps()}
                style={{
                  flex: 1, overflowY: 'auto', position: 'relative',
                  background: isDragActive ? 'var(--accent-subtle)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <input {...getInputProps()} />
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  style={{
                    minHeight: '100%', outline: 'none',
                    padding: '20px 24px',
                    fontSize: 14, lineHeight: 1.8,
                    color: 'var(--text-primary)', fontFamily: 'inherit',
                  }}
                  data-placeholder="Write your message…"
                  aria-label="Email body"
                />
                {isDragActive && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: 'var(--accent-light)', fontWeight: 500,
                    pointerEvents: 'none',
                  }}>
                    Drop to attach or embed image
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', opacity: 0.5 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 8 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <p style={{ fontSize: 13 }}>Template body is rendered by Resend</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Fill in the variables above</p>
                </div>
              </div>
            )}

            {/* Attachments */}
            {attachedFiles.length > 0 && (
              <div style={{ padding: '8px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                {attachedFiles.map((f) => (
                  <span
                    key={f.key}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 'var(--radius-full)',
                      background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                      fontSize: 12, color: 'var(--text-secondary)',
                    }}
                  >
                    📎 {f.filename}
                    <button
                      onClick={() => setAttachedFiles((p) => p.filter((a) => a.key !== f.key))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 14 }}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-elevated)', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  Attach
                  <input
                    type="file" multiple style={{ display: 'none' }}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? [])
                      for (const file of files) {
                        const form = new FormData()
                        form.append('file', file)
                        const res = await fetch(`/api/attachments/upload?accountId=${fromAccountId}`, {
                          method: 'POST', credentials: 'include', body: form,
                        })
                        const data = await res.json() as { success: boolean; data: { key: string; filename: string } }
                        if (data.success) setAttachedFiles((p) => [...p, data.data])
                      }
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ color: 'var(--text-muted)' }} onClick={handleClose}>Discard</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={sending || !to || !subject}
                  style={{ minWidth: 90, justifyContent: 'center' }}
                >
                  {sending ? (
                    <>
                      <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                      Sending…
                    </>
                  ) : 'Send ↗'}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — AI Panel */}
          <div style={{
            width: 300, flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(129,140,248,0.05) 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI Assistant</span>
              </div>
              {currentAccount && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 32, display: 'block' }}>{currentAccount.ai_model}</span>
              )}
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tone buttons */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adjust Tone</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['formal', 'casual', 'concise'] as const).map((tone) => (
                    <button
                      key={tone}
                      className="btn btn-ghost"
                      style={{ flex: 1, fontSize: 11, padding: '5px 4px' }}
                      onClick={() => handleTone(tone)}
                      disabled={aiLoading}
                    >
                      {tone === 'formal' ? '🎩' : tone === 'casual' ? '✌' : '⚡'} {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate draft (reply mode only) */}
              {replyToEmailId && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Draft Reply</p>
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', fontSize: 12 }}
                    onClick={handleGenerateDraft}
                    disabled={aiLoading}
                  >
                    {aiLoading ? '…' : '✨ Generate AI Draft'}
                  </button>
                </div>
              )}

              {/* Custom AI prompt */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Prompt</p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Make it more professional, add a call to action, translate to Spanish…"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: '8px 10px',
                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
                    resize: 'none', outline: 'none', lineHeight: 1.5,
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCustomAI() }}
                />
                <button
                  className="btn btn-ghost"
                  style={{ width: '100%', marginTop: 6, fontSize: 12 }}
                  onClick={handleCustomAI}
                  disabled={aiLoading || !aiPrompt.trim()}
                >
                  {aiLoading ? '…' : 'Run ↗'}
                </button>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>Ctrl+Enter to run</p>
              </div>

              {/* AI output */}
              {aiOutput && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Result</p>
                  <div style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: '10px 12px',
                    fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
                    maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap',
                  }}>
                    {aiOutput}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={applyAiOutput}
                    >
                      Apply to Editor
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={() => { setAiOutput(''); setAiPrompt('') }}
                      title="Discard result"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
