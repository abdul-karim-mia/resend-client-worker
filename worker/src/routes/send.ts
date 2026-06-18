import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { Resend } from 'resend'
import { decryptApiKey } from '../lib/crypto'
import { resolveThreadId } from '../lib/threading'
import type { Bindings, Account } from '../types'

export const sendRoutes = new Hono<{ Bindings: Bindings }>()

// POST /api/send — send or reply to an email
sendRoutes.post('/', async (c) => {
  const body = await c.req.json<{
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
    senderName?: string    // selected sender identity name
    senderEmail?: string   // selected sender identity email
  }>()

  const {
    accountId, to, cc, bcc, subject, html, text,
    replyToEmailId, attachmentKeys, templateId, templateVariables,
    senderName, senderEmail,
  } = body

  if (!accountId || !to?.length || !subject) {
    return c.json({ success: false, error: 'accountId, to, and subject are required' }, 400)
  }

  // Load account
  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`)
    .bind(accountId).first<Account>()

  if (!account) return c.json({ success: false, error: 'Account not found' }, 404)

  const apiKey = await decryptApiKey(account.resend_api_key_enc, c.env.MASTER_ENCRYPTION_KEY)
  const resend = new Resend(apiKey)

  // Resolve the From address:
  // 1. Explicit sender from payload (user picked from dropdown)
  // 2. Account's from_email field
  // 3. Fall back to noreply@domain
  const fromAddress = senderEmail ?? account.from_email ?? `noreply@${account.domain}`
  const fromName = senderName ?? account.from_name
  const fromHeader = `${fromName} <${fromAddress}>`

  // ── Threading headers (RFC 2822) ──────────────────────────────────────────
  let inReplyTo: string | undefined
  let references: string | undefined
  let threadId: string

  if (replyToEmailId) {
    const parent = await c.env.DB.prepare(
      `SELECT thread_id, message_id FROM emails WHERE id = ?`
    ).bind(replyToEmailId).first<{ thread_id: string; message_id: string | null }>()

    if (parent) {
      threadId = parent.thread_id
      inReplyTo = parent.message_id ?? undefined
      references = parent.message_id ?? undefined
    } else {
      threadId = crypto.randomUUID()
    }
  } else {
    threadId = crypto.randomUUID()
  }

  // ── Build attachments from R2 ─────────────────────────────────────────────
  const attachments: Array<{ filename: string; content: string }> = []
  if (attachmentKeys && attachmentKeys.length > 0) {
    for (const key of attachmentKeys) {
      try {
        const obj = await c.env.R2.get(key)
        if (obj) {
          const buffer = await obj.arrayBuffer()
          // Use reduce to avoid RangeError on large files (Array spread fails >~1MB)
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          )
          attachments.push({
            filename: key.split('/').pop() ?? 'attachment',
            content: base64,
          })
        }
      } catch (err) {
        console.error('[send] Attachment fetch error:', err)
      }
    }
  }

  // ── Send via Resend ───────────────────────────────────────────────────────
  // Template mode uses Resend's template_id field (SDK v4+ format).
  // Inline mode passes html + optional attachments.
  const threadingHeaders = {
    ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
    ...(references ? { References: references } : {}),
  }

  const sendPayload = templateId
    ? {
        from: fromHeader,
        to,
        ...(cc?.length ? { cc } : {}),
        ...(bcc?.length ? { bcc } : {}),
        subject,
        // Resend SDK v4: use template_id at root level, variables as top-level fields
        template_id: templateId,
        ...(templateVariables && Object.keys(templateVariables).length > 0 ? templateVariables : {}),
        headers: threadingHeaders,
      }
    : {
        from: fromHeader,
        to,
        ...(cc?.length ? { cc } : {}),
        ...(bcc?.length ? { bcc } : {}),
        subject,
        html: html ?? '',
        ...(text ? { text } : {}),
        headers: threadingHeaders,
        ...(attachments.length > 0 ? { attachments } : {}),
      }

  const { data, error } = await resend.emails.send(sendPayload as Parameters<typeof resend.emails.send>[0])

  if (error) {
    console.error('[send] Resend error:', error)
    return c.json({ success: false, error: error.message }, 400)
  }

  // ── Save sent email to DB ─────────────────────────────────────────────────
  const emailId = nanoid()
  await c.env.DB.prepare(`
    INSERT INTO emails (
      id, account_id, thread_id, message_id,
      in_reply_to, folder, direction,
      sender_name, sender_email,
      recipient_to, recipient_cc, recipient_bcc,
      subject, body_html, body_text,
      read_status, delivery_status, resend_email_id
    ) VALUES (?, ?, ?, ?, ?, 'sent', 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'sent', ?)
  `).bind(
    emailId, accountId, threadId, null,
    inReplyTo ?? null,
    fromName, fromAddress,
    JSON.stringify(to),
    cc?.length ? JSON.stringify(cc) : null,
    bcc?.length ? JSON.stringify(bcc) : null,
    subject, html ?? null, text ?? null,
    data?.id ?? null
  ).run()

  return c.json({ success: true, data: { id: emailId, resendId: data?.id } })
})

// POST /api/send/draft — create or update a draft
sendRoutes.post('/draft', async (c) => {
  const body = await c.req.json<{
    accountId: string
    to?: string[]
    subject?: string
    html?: string
    existingDraftId?: string
  }>()

  if (!body.accountId) {
    return c.json({ success: false, error: 'accountId is required' }, 400)
  }

  const emailId = body.existingDraftId ?? nanoid()

  if (body.existingDraftId) {
    // Update existing draft
    await c.env.DB.prepare(`
      UPDATE emails SET
        recipient_to = ?, subject = ?, body_html = ?
      WHERE id = ? AND folder = 'drafts' AND account_id = ?
    `).bind(
      JSON.stringify(body.to ?? []),
      body.subject ?? '(Draft)',
      body.html ?? '',
      emailId,
      body.accountId,
    ).run()
  } else {
    // Create new draft
    await c.env.DB.prepare(`
      INSERT INTO emails (
        id, account_id, thread_id, message_id,
        folder, direction, sender_email,
        recipient_to, subject, body_html,
        read_status, delivery_status
      ) VALUES (?, ?, ?, null, 'drafts', 'outbound', ?, ?, ?, ?, 1, 'pending')
    `).bind(
      emailId, body.accountId, crypto.randomUUID(),
      `draft@${emailId}`,
      JSON.stringify(body.to ?? []),
      body.subject ?? '(Draft)',
      body.html ?? '',
    ).run()
  }

  return c.json({ success: true, data: { id: emailId } })
})
