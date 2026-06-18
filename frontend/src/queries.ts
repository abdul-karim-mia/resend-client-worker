// TanStack Query hooks — all server state lives here
// Pattern: react-state-management, cc-skill-backend-patterns

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

const API_BASE = '/api'

// ── Types ─────────────────────────────────────────────────────

export interface Account {
  id: string
  name: string
  domain: string
  from_name: string
  from_email: string | null
  webhook_secret: string
  auto_reply_enabled: number
  ai_system_prompt: string
  ai_model: string
  email_count: number
  created_at: string
}

export interface AccountSender {
  id: string
  account_id: string
  name: string
  email: string
  is_default: number
  created_at: string
}

export interface Email {
  id: string
  account_id: string
  thread_id: string
  message_id: string | null
  in_reply_to: string | null
  folder: string
  direction: 'inbound' | 'outbound'
  sender_name: string | null
  sender_email: string
  recipient_to: string
  subject: string | null
  body_html: string | null
  body_text: string | null
  read_status: number
  delivery_status: string
  created_at: string
  attachment_count?: number
}

export interface Attachment {
  id: string
  filename: string
  content_type: string | null
  size_bytes: number | null
}

// ── API helper ────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include',
    ...init,
  })

  if (res.status === 401) {
    // Session expired — reload to trigger redirect to /login (only if not already on /login)
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  const data = await res.json() as { success: boolean; data?: T; error?: string }
  if (!data.success) throw new Error(data.error ?? 'API error')
  return data.data as T
}

// ── Accounts ──────────────────────────────────────────────────

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiFetch<Account[]>('/settings/accounts'),
    staleTime: 30_000,
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      name: string
      domain: string
      fromName: string
      fromEmail?: string
      resendApiKey: string
      aiSystemPrompt?: string
      autoReplyEnabled?: boolean
      aiModel?: string
      senders?: Array<{ name: string; email: string; isDefault?: boolean }>
    }) =>
      apiFetch<{
        id: string
        webhookUrl: string
        webhookSecret: string
        maskedApiKey: string
      }>('/settings/accounts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      fromName?: string
      fromEmail?: string | null
      resendApiKey?: string
      aiSystemPrompt?: string
      autoReplyEnabled?: boolean
      aiModel?: string
    }) =>
      apiFetch(`/settings/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/settings/accounts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

// ── Account Senders ───────────────────────────────────────────

export function useAccountSenders(accountId: string | null) {
  return useQuery({
    queryKey: ['senders', accountId],
    queryFn: () => apiFetch<AccountSender[]>(`/settings/accounts/${accountId}/senders`),
    enabled: !!accountId,
    staleTime: 30_000,
  })
}

export function useCreateSender(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; email: string; isDefault?: boolean }) =>
      apiFetch<AccountSender>(`/settings/accounts/${accountId}/senders`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['senders', accountId] })
    },
  })
}

export function useDeleteSender(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (senderId: string) =>
      apiFetch(`/settings/accounts/${accountId}/senders/${senderId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['senders', accountId] })
    },
  })
}

export function useSetDefaultSender(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (senderId: string) =>
      apiFetch(`/settings/accounts/${accountId}/senders/${senderId}/default`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['senders', accountId] })
    },
  })
}

// ── All senders across all accounts (for Composer From dropdown) ──

export function useAllSenders(accounts: Account[] | undefined) {
  return useQuery({
    queryKey: ['all-senders', accounts?.map((a) => a.id)],
    queryFn: async () => {
      if (!accounts || accounts.length === 0) return []
      const results = await Promise.all(
        accounts.map((acc) =>
          apiFetch<AccountSender[]>(`/settings/accounts/${acc.id}/senders`).then((senders) =>
            senders.map((s) => ({ ...s, _accountDomain: acc.domain, _accountAiModel: acc.ai_model }))
          )
        )
      )
      return results.flat()
    },
    enabled: !!accounts && accounts.length > 0,
    staleTime: 30_000,
  })
}

// ── Emails ────────────────────────────────────────────────────

export function useEmails(
  accountId: string | null,
  folder: string,
  refetchInterval = 30_000
) {
  return useQuery({
    queryKey: ['emails', accountId, folder],
    queryFn: () =>
      apiFetch<Email[]>(`/emails?accountId=${accountId}&folder=${folder}`),
    enabled: !!accountId,
    refetchInterval,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  })
}

export function useEmail(emailId: string | null) {
  return useQuery({
    queryKey: ['email', emailId],
    queryFn: () => apiFetch<Email & { attachments: Attachment[] }>(`/emails/${emailId}`),
    enabled: !!emailId,
    staleTime: 60_000,
  })
}

export function useSearchEmails(accountId: string | null, query: string) {
  return useQuery({
    queryKey: ['search', accountId, query],
    queryFn: () =>
      apiFetch<Email[]>(`/emails/search?accountId=${accountId}&q=${encodeURIComponent(query)}`),
    enabled: !!accountId && query.length > 2,
    staleTime: 5_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ emailId, read }: { emailId: string; read: boolean }) =>
      apiFetch(`/emails/${emailId}/read`, {
        method: 'PUT',
        body: JSON.stringify({ read }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

export function useMoveFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ emailId, folder }: { emailId: string; folder: string }) =>
      apiFetch(`/emails/${emailId}/folder`, {
        method: 'PUT',
        body: JSON.stringify({ folder }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

export function useDeleteEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emailId: string) =>
      apiFetch(`/emails/${emailId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

export function useSendEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      accountId: string
      to: string[]
      cc?: string[]
      bcc?: string[]
      subject: string
      html?: string
      text?: string
      replyToEmailId?: string
      templateId?: string
      templateVariables?: Record<string, string | number>
      attachmentKeys?: string[]
      senderName?: string
      senderEmail?: string
    }) => apiFetch('/send', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

// Save or update a draft — returns the draft emailId
export function useSaveDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      accountId: string
      to?: string[]
      subject?: string
      html?: string
      existingDraftId?: string
    }) => apiFetch<{ id: string }>('/send/draft', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

// ── Resend Templates ──────────────────────────────────────────

export interface ResendTemplate {
  id: string
  name: string
  alias: string | null
  status: 'draft' | 'published'
  created_at: string
}

export interface ResendTemplateDetail extends ResendTemplate {
  subject: string | null
  html: string | null
  variables?: Array<{ key: string; type: string; fallbackValue?: string | number }>
}

export function useResendTemplates(accountId: string | null) {
  return useQuery({
    queryKey: ['resend-templates', accountId],
    queryFn: () => apiFetch<ResendTemplate[]>(`/templates/resend?accountId=${accountId}`),
    enabled: !!accountId,
    staleTime: 60_000,
  })
}

export function useResendTemplate(accountId: string | null, templateId: string | null) {
  return useQuery({
    queryKey: ['resend-template', accountId, templateId],
    queryFn: () => apiFetch<ResendTemplateDetail>(`/templates/resend/${templateId}?accountId=${accountId}`),
    enabled: !!accountId && !!templateId,
    staleTime: 60_000,
  })
}

// ── AI ────────────────────────────────────────────────────────

// Generate an AI draft reply for a specific email.
// Uses useMutation (POST operation) — call mutateAsync(emailId) to trigger.
export function useAIDraftReply() {
  return useMutation({
    mutationFn: (emailId: string) =>
      apiFetch<{ draft: string }>(`/ai/draft-reply/${emailId}`, { method: 'POST' }),
  })
}

export function useAISummarize() {
  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ summary: string }>(`/ai/summarize/${threadId}`, { method: 'POST' }),
  })
}

export function useAIAdjustTone() {
  return useMutation({
    mutationFn: (payload: { text: string; tone: 'formal' | 'casual' | 'concise'; accountId?: string }) =>
      apiFetch<{ result: string }>('/ai/adjust-tone', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })
}

// Apply a free-form AI instruction to the current email body.
// Used by the Composer's "Custom Prompt" panel.
export function useAICustomPrompt() {
  return useMutation({
    mutationFn: (payload: { text: string; prompt: string; accountId?: string }) =>
      apiFetch<{ result: string }>('/ai/custom-prompt', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })
}

export function useQuickReplySuggestions() {
  return useMutation({
    mutationFn: ({ emailId, accountId }: { emailId: string; accountId: string }) =>
      apiFetch<{ suggestions: string[] }>('/ai/quick-reply-suggestions', {
        method: 'POST',
        body: JSON.stringify({ emailId, accountId }),
      }),
  })
}

// ── Auth ──────────────────────────────────────────────────────

export function useAuth() {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiFetch<{ username: string }>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      apiFetch<{ username: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(creds),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-me'] })
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear()
      window.location.href = '/login'
    },
  })
}
