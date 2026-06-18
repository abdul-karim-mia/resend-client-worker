import React, { useState, useEffect } from 'react'
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useAccountSenders,
  useCreateSender,
  useDeleteSender,
  useSetDefaultSender,
} from '../queries'
import type { Account } from '../queries'
import { useAppStore } from '../store'
import { AI_MODELS, AI_MODEL_CATEGORIES, BADGE_COLORS } from './aiModels'

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '24px',
  boxShadow: 'var(--shadow-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

export default function SettingsPanel() {
  const { data: accounts, isLoading: loadingAccounts } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const addToast = useAppStore((s) => s.addToast)

  const [selectedAcc, setSelectedAcc] = useState<Account | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Form states
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [resendApiKey, setResendApiKey] = useState('')
  const [aiSystemPrompt, setAiSystemPrompt] = useState('')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [aiModel, setAiModel] = useState('@cf/meta/llama-3.2-3b-instruct')

  const [showApiKey, setShowApiKey] = useState(false)

  // Sender identity management (for editing an existing account / creating a new one)
  const [localSenders, setLocalSenders] = useState<Array<{ id: string; name: string; email: string; is_default: number }>>([])
  const [hasEditedSenders, setHasEditedSenders] = useState(false)

  const { data: senders = [], isLoading: loadingSenders } = useAccountSenders(selectedAcc?.id ?? null)
  const createSender = useCreateSender(selectedAcc?.id ?? '')
  const deleteSender = useDeleteSender(selectedAcc?.id ?? '')
  const setDefaultSender = useSetDefaultSender(selectedAcc?.id ?? '')
  const [newSenderName, setNewSenderName] = useState('')
  const [newSenderEmail, setNewSenderEmail] = useState('')
  const [addingSender, setAddingSender] = useState(false)

  // Reset form when selection changes
  useEffect(() => {
    if (selectedAcc) {
      setIsCreating(false)
      setName(selectedAcc.name)
      setDomain(selectedAcc.domain)
      setResendApiKey('') // Don't prefill password fields
      setAiSystemPrompt(selectedAcc.ai_system_prompt)
      setAutoReplyEnabled(selectedAcc.auto_reply_enabled === 1)
      setAiModel(selectedAcc.ai_model || '@cf/meta/llama-3.2-3b-instruct')
    } else {
      resetForm()
    }
  }, [selectedAcc])

  // Sync default sender during creation if name and domain are entered and list hasn't been edited
  useEffect(() => {
    if (isCreating && !hasEditedSenders) {
      const trimmedName = name.trim()
      const trimmedDomain = domain.trim()
      if (trimmedName || trimmedDomain) {
        setLocalSenders([
          {
            id: 'default_local',
            name: trimmedName || 'Default Sender',
            email: `support@${trimmedDomain || 'yourdomain.com'}`,
            is_default: 1
          }
        ])
      } else {
        setLocalSenders([])
      }
    }
  }, [name, domain, isCreating, hasEditedSenders])

  const resetForm = () => {
    setName('')
    setDomain('')
    setResendApiKey('')
    setAiSystemPrompt('You are a helpful customer support agent. Be concise, polite, and professional.')
    setAutoReplyEnabled(false)
    setAiModel('@cf/meta/llama-3.2-3b-instruct')
    setLocalSenders([])
    setHasEditedSenders(false)
  }

  const handleCreateClick = () => {
    setSelectedAcc(null)
    setIsCreating(true)
    resetForm()
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    addToast(`${label} copied to clipboard!`, 'success')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isCreating) {
      if (!resendApiKey) {
        addToast('Resend API key is required.', 'error')
        return
      }
      try {
        await createAccount.mutateAsync({
          name,
          domain,
          fromName: name,        // use account name as default sender name on creation
          resendApiKey,
          aiSystemPrompt,
          autoReplyEnabled,
          aiModel,
          senders: localSenders.map((s) => ({
            name: s.name,
            email: s.email,
            isDefault: s.is_default === 1
          }))
        })
        addToast('Account created successfully!', 'success')
        setIsCreating(false)
        resetForm()
      } catch (err: any) {
        addToast(err.message || 'Failed to create account', 'error')
      }
    } else if (selectedAcc) {
      try {
        await updateAccount.mutateAsync({
          id: selectedAcc.id,
          name,
          resendApiKey: resendApiKey || undefined,
          aiSystemPrompt,
          autoReplyEnabled,
          aiModel
        })
        addToast('Account updated successfully!', 'success')
        setResendApiKey('') // reset field
      } catch (err: any) {
        addToast(err.message || 'Failed to update account', 'error')
      }
    }
  }

  const handleDelete = async () => {
    if (!selectedAcc) return
    if (confirm(`Are you sure you want to delete account "${selectedAcc.name}"? This will permanently delete all stored emails and attachments associated with it.`)) {
      try {
        await deleteAccount.mutateAsync(selectedAcc.id)
        addToast('Account deleted successfully.', 'success')
        setSelectedAcc(null)
        resetForm()
      } catch (err: any) {
        addToast(err.message || 'Failed to delete account', 'error')
      }
    }
  }

  // Get active webhook details for display when editing
  const workerUrl = window.location.origin
  const webhookUrl = selectedAcc ? `${workerUrl}/webhook/${selectedAcc.id}/inbound` : ''

  return (
    <main className="reading-pane active" style={{ flex: 1, flexDirection: 'row', display: 'flex', minWidth: 0 }}>
      {/* Left panel: Account list */}
      <div style={{
        width: 260,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        flexShrink: 0
      }}>
        {/* Navigation back to main mail client */}
        <a href="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          fontSize: 13,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          fontWeight: 500,
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.background = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.background = 'var(--bg-elevated)'
        }}
        >
          <span style={{ fontSize: 14 }}>←</span> Back to Mail
        </a>

        <div style={{
          padding: '16px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)'
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Resend Accounts</h2>
          <button
            className="btn btn-primary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={handleCreateClick}
          >
            ➕ Add
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loadingAccounts ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />
            ))
          ) : accounts && accounts.length > 0 ? (
            accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedAcc(acc)}
                className={`nav-item ${selectedAcc?.id === acc.id ? 'active' : ''}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  height: 'auto'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: selectedAcc?.id === acc.id ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                  {acc.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {acc.domain}
                </div>
              </button>
            ))
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No accounts configured. Click "+ Add" to add your first account.
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Edit/Add form */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {isCreating || selectedAcc ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 750 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  {isCreating ? 'Configure New Resend Account' : `Manage Account: ${name}`}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {isCreating 
                    ? 'Connect an email domain hosted on Resend to start managing it in this client.' 
                    : `Account registered on ${new Date(selectedAcc!.created_at).toLocaleDateString()}`}
                </p>
              </div>

              {/* 1. General & Domain Settings Card */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>⚙️</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>General Settings</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label className="sr-only" htmlFor="acc-name">Account Name</label>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Account Name
                    </span>
                    <input
                      id="acc-name"
                      type="text"
                      className="input"
                      placeholder="e.g. Support Inbox"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="sr-only" htmlFor="acc-domain">Verified Domain</label>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Verified Domain
                    </span>
                    <input
                      id="acc-domain"
                      type="text"
                      className="input"
                      placeholder="e.g. support.yourdomain.com"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      required
                      disabled={!isCreating} // Domain is primary lookup, lock it after creation
                      style={!isCreating ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    />
                  </div>
                </div>

                <div>
                  <label className="sr-only" htmlFor="acc-api-key">Resend API Key</label>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Resend API Key {!isCreating && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(Leave blank to keep current)</span>}
                  </span>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="acc-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      className="input"
                      placeholder={isCreating ? 're_...' : '••••••••••••••••••••••••'}
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                      required={isCreating}
                      style={{ paddingRight: 75 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6,
                        color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '3px 8px'
                      }}
                    >
                      {showApiKey ? '🙈 Hide' : '👁️ Show'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Sender Identities Card */}
              {((!isCreating && selectedAcc) || isCreating) && (
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>📬</span>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Sender Identities</h3>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          Add names and emails to choose from in the Composer
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => setAddingSender(!addingSender)}
                    >
                      {addingSender ? 'Cancel' : '➕ Add Sender'}
                    </button>
                  </div>

                  {/* Add sender inline form */}
                  {addingSender && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8,
                      padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    }}>
                      <div>
                        <input
                          type="text" className="input" placeholder="Display Name (e.g. Support)"
                          value={newSenderName} onChange={(e) => setNewSenderName(e.target.value)}
                        />
                      </div>
                      <div>
                        <input
                          type="email" className="input" placeholder={`e.g. info@${domain || 'domain.com'}`}
                          value={newSenderEmail} onChange={(e) => setNewSenderEmail(e.target.value)}
                        />
                      </div>
                      <button
                        type="button" className="btn btn-primary"
                        style={{ whiteSpace: 'nowrap', padding: '0 16px', height: '100%' }}
                        onClick={async () => {
                          if (!newSenderName.trim() || !newSenderEmail.trim()) {
                            addToast('Name and email required', 'error'); return
                          }
                          if (isCreating) {
                            const isFirst = localSenders.length === 0
                            setLocalSenders((prev) => [
                              ...prev,
                              {
                                id: `local_${Date.now()}`,
                                name: newSenderName.trim(),
                                email: newSenderEmail.trim(),
                                is_default: isFirst ? 1 : 0
                              }
                            ])
                            setNewSenderName('')
                            setNewSenderEmail('')
                            setAddingSender(false)
                            setHasEditedSenders(true)
                          } else {
                            try {
                              await createSender.mutateAsync({ name: newSenderName.trim(), email: newSenderEmail.trim() })
                              addToast('Sender added!', 'success')
                              setNewSenderName('')
                              setNewSenderEmail('')
                              setAddingSender(false)
                            } catch (err: any) {
                              addToast(err.message || 'Failed to add sender', 'error')
                            }
                          }
                        }}
                      >
                        Save
                      </button>
                    </div>
                  )}

                  {/* Sender list */}
                  {(isCreating ? false : loadingSenders) ? (
                    <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
                  ) : (isCreating ? localSenders : senders).length === 0 ? (
                    <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                      No senders yet. Click "Add Sender" to add your first.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(isCreating ? localSenders : senders).map((s) => (
                        <div key={s.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px', borderRadius: 'var(--radius-md)',
                          border: s.is_default === 1 ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                          background: s.is_default === 1 ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                          transition: 'border-color 0.2s, background 0.2s',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: s.is_default === 1 ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                                {s.name}
                              </span>
                              {s.is_default === 1 && (
                                <span style={{
                                  fontSize: 9, fontWeight: 700,
                                  color: 'var(--accent-light)', background: 'var(--accent-subtle)',
                                  padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border-accent)',
                                  letterSpacing: '0.04em'
                                }}>
                                  DEFAULT
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.email}</div>
                          </div>
                          {s.is_default !== 1 && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (isCreating) {
                                  setLocalSenders((prev) =>
                                    prev.map((item) => ({
                                      ...item,
                                      is_default: item.id === s.id ? 1 : 0
                                    }))
                                  )
                                  setHasEditedSenders(true)
                                } else {
                                  try { await setDefaultSender.mutateAsync(s.id); addToast('Default sender updated', 'success') }
                                  catch { addToast('Failed to set default', 'error') }
                                }
                              }}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '4px 10px', height: 'auto' }}
                            >
                              Set default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              if (isCreating) {
                                setLocalSenders((prev) => {
                                  const filtered = prev.filter((item) => item.id !== s.id)
                                  if (s.is_default === 1 && filtered.length > 0) {
                                    filtered[0].is_default = 1
                                  }
                                  return filtered
                                })
                                setHasEditedSenders(true)
                              } else {
                                if (confirm(`Remove sender "${s.name} <${s.email}>"?`)) {
                                  try { await deleteSender.mutateAsync(s.id); addToast('Sender removed', 'success') }
                                  catch { addToast('Failed to remove sender', 'error') }
                                }
                              }
                            }}
                            className="btn-icon"
                            style={{ padding: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Remove sender"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. AI Copilot Settings Card */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>🤖</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Workers AI Copilot</h3>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* AI Model Picker — categorized cards */}
                  <div>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      AI Model
                    </span>
                    {AI_MODEL_CATEGORIES.map((cat) => {
                      const models = AI_MODELS.filter((m) => m.category === cat)
                      return (
                        <div key={cat} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                            {cat}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                            {models.map((model) => {
                              const isSelected = aiModel === model.id
                              return (
                                <button
                                  key={model.id}
                                  type="button"
                                  onClick={() => setAiModel(model.id)}
                                  style={{
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                                    background: isSelected ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-elevated))' : 'var(--bg-elevated)',
                                    boxShadow: isSelected ? '0 0 10px var(--accent-glow)' : 'none',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s var(--ease-out)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 3,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-hover)'
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'space-between', width: '100%' }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                                      {model.name} {isSelected && '✓'}
                                    </span>
                                    {model.badge && (
                                      <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                                        background: BADGE_COLORS[model.badge] ?? 'var(--text-muted)',
                                        color: '#fff', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
                                      }}>
                                        {model.badge}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    {model.description}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {/* Selected model reference */}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                      Selected: {aiModel}
                    </div>
                  </div>

                  <div>
                    <label className="sr-only" htmlFor="acc-ai-prompt">AI System Prompt</label>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      AI System Prompt / Personality
                    </span>
                    <textarea
                      id="acc-ai-prompt"
                      className="input"
                      rows={3}
                      placeholder="Describe how the AI should write drafts and auto-replies..."
                      value={aiSystemPrompt}
                      onChange={(e) => setAiSystemPrompt(e.target.value)}
                      style={{ resize: 'vertical', minHeight: 70 }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <input
                      id="acc-auto-reply"
                      type="checkbox"
                      checked={autoReplyEnabled}
                      onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <label htmlFor="acc-auto-reply" style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                      Enable AI Auto-Reply (Autopilot mode for incoming emails)
                    </label>
                  </div>
                </div>
              </div>

              {/* 4. Inbound Webhook Configuration Card */}
              {!isCreating && selectedAcc && (
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>⚡</span>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Inbound Webhook Configuration</h3>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                    Copy these credentials into your **Resend Dashboard &gt; Webhooks** page to allow this client to receive incoming emails and track delivery events.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Endpoint URL
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="text" className="input" value={webhookUrl} readOnly style={{ opacity: 0.8, fontFamily: 'monospace', fontSize: 12 }} />
                        <button type="button" className="btn btn-ghost" onClick={() => handleCopy(webhookUrl, 'Webhook URL')} style={{ gap: 6 }}>
                          📋 Copy
                        </button>
                      </div>
                    </div>

                    <div>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Webhook Secret (Svix secret keys)
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="text" className="input" value={selectedAcc.webhook_secret} readOnly style={{ opacity: 0.8, fontFamily: 'monospace', fontSize: 12 }} />
                        <button type="button" className="btn btn-ghost" onClick={() => handleCopy(selectedAcc.webhook_secret, 'Webhook Secret')} style={{ gap: 6 }}>
                          📋 Copy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div> {/* end scrollable content */}

            {/* Sticky action bar — always visible at bottom with glass effect */}
            <div style={{
              position: 'sticky',
              bottom: 0,
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              borderTop: '1px solid var(--border)',
              padding: '14px 24px',
              display: 'flex',
              gap: 12,
              zIndex: 10,
            }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createAccount.isPending || updateAccount.isPending}
              >
                {createAccount.isPending || updateAccount.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
              
              {!isCreating && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={deleteAccount.isPending}
                  style={{ marginLeft: 'auto' }}
                >
                  {deleteAccount.isPending ? 'Deleting...' : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>Delete Account</>
                  )}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--text-muted)', gap: 12
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
              <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <h3 style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Resend Client Settings Dashboard</h3>
            <p style={{ fontSize: 13, maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
              Select an account from the list to modify its settings, view webhooks, or click "+ Add" to configure a new inbox.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
