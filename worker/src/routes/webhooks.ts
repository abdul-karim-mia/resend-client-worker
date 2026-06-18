import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { resolveThreadId } from '../lib/threading'
import { decryptApiKey } from '../lib/crypto'
import { Resend } from 'resend'
import type { Bindings, Account } from '../types'

export const webhookRoutes = new Hono<{ Bindings: Bindings }>()

// POST /webhook/:accountId/inbound — Receive inbound emails from Resend
webhookRoutes.post('/:accountId/inbound', async (c) => {
  const accountId = c.req.param('accountId')

  // 1. Load account + verify it exists
  const account = await c.env.DB.prepare(
    `SELECT * FROM accounts WHERE id = ?`
  ).bind(accountId).first<Account>()

  if (!account) {
    return c.json({ error: 'Account not found' }, 404)
  }

  // 2. Verify webhook signature (HMAC-SHA256)
  const signature = c.req.header('svix-signature') ?? c.req.header('resend-signature') ?? ''
  const rawBody = await c.req.text()

  if (account.webhook_secret && !(await verifySignature(rawBody, signature, account.webhook_secret))) {
    console.warn(`[webhook] Invalid signature for account ${accountId}`)
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payload = JSON.parse(rawBody)
  const emailData = payload.data ?? payload

  // 3. Resolve thread ID
  const threadId = await resolveThreadId(
    c.env.DB,
    accountId,
    emailData.headers?.['in-reply-to'] ?? emailData.in_reply_to ?? null,
    emailData.headers?.references ?? null
  )

  // 4. Sanitize HTML body (basic server-side strip of dangerous tags)
  const bodyHtml = emailData.html ? sanitizeHtml(emailData.html) : null
  const bodyText = emailData.text ?? null

  // 5. Create email record
  const emailId = nanoid()
  await c.env.DB.prepare(`
    INSERT INTO emails (
      id, account_id, thread_id, message_id, in_reply_to,
      folder, direction, sender_name, sender_email,
      recipient_to, recipient_cc, subject,
      body_html, body_text, read_status, delivery_status
    ) VALUES (?, ?, ?, ?, ?, 'inbox', 'inbound', ?, ?, ?, ?, ?, ?, ?, 0, 'delivered')
  `).bind(
    emailId, accountId, threadId,
    emailData.headers?.['message-id'] ?? emailData.message_id ?? null,
    emailData.headers?.['in-reply-to'] ?? emailData.in_reply_to ?? null,
    emailData.from_name ?? extractName(emailData.from ?? ''),
    extractEmail(emailData.from ?? ''),
    JSON.stringify(Array.isArray(emailData.to) ? emailData.to : [emailData.to ?? '']),
    emailData.cc ? JSON.stringify(Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc]) : null,
    emailData.subject ?? '(no subject)',
    bodyHtml, bodyText
  ).run()

  // 6. Handle attachments
  if (emailData.attachments && Array.isArray(emailData.attachments)) {
    await processAttachments(c.env, accountId, emailId, emailData.attachments, account)
  }

  // 7. Auto-reply (if enabled)
  if (account.auto_reply_enabled === 1 && bodyText) {
    await triggerAutoReply(c.env, account, emailId, emailData, bodyText)
  }

  return c.json({ success: true })
})

// POST /webhook/:accountId/events — Delivery status updates from Resend
webhookRoutes.post('/:accountId/events', async (c) => {
  const accountId = c.req.param('accountId')

  const account = await c.env.DB.prepare(
    `SELECT webhook_secret FROM accounts WHERE id = ?`
  ).bind(accountId).first<{ webhook_secret: string }>()

  if (!account) return c.json({ error: 'Account not found' }, 404)

  const signature = c.req.header('svix-signature') ?? c.req.header('resend-signature') ?? ''
  const rawBody = await c.req.text()

  if (account.webhook_secret && !(await verifySignature(rawBody, signature, account.webhook_secret))) {
    console.warn(`[webhook/events] Invalid signature for account ${accountId}`)
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payload = JSON.parse(rawBody) as { type: string; data: { email_id: string } }

  const statusMap: Record<string, string> = {
    'email.sent':             'sent',
    'email.delivered':        'delivered',
    'email.delivery_delayed': 'pending',
    'email.bounced':          'bounced',
    'email.opened':           'opened',
    'email.clicked':          'opened',
  }

  const newStatus = statusMap[payload.type]
  if (!newStatus) return c.json({ success: true }) // Ignore unknown events

  await c.env.DB.prepare(
    `UPDATE emails SET delivery_status = ? WHERE resend_email_id = ? AND account_id = ?`
  ).bind(newStatus, payload.data.email_id, accountId).run()

  return c.json({ success: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify', 'sign']
    )
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const sigHex = signature.includes(',') ? signature.split(',')[1] ?? '' : signature
    return timingSafeEqual(expectedHex, sigHex)
  } catch {
    return false
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ (b.charCodeAt(i) ?? 0)
  }
  return result === 0
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match?.[1] ?? from.trim()
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</)
  return match?.[1]?.trim() ?? ''
}

/**
 * Basic server-side HTML sanitization — strips scripts, iframes, and event handlers.
 * Client-side DOMPurify is applied again when rendering.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"])[^'"]*\1/gi, '')
    .replace(/javascript:/gi, 'blocked:')
}

async function processAttachments(
  env: Bindings,
  accountId: string,
  emailId: string,
  attachments: Array<{ filename?: string; content_type?: string; attachment_id?: string }>,
  account: Account
): Promise<void> {
  for (const att of attachments) {
    try {
      const filename = sanitizeFilename(att.filename ?? 'attachment')
      const r2Key = `attachments/${accountId}/${emailId}/${nanoid()}_${filename}`

      if (att.attachment_id) {
        const apiKey = await decryptApiKey(account.resend_api_key_enc, env.MASTER_ENCRYPTION_KEY)
        const response = await fetch(
          `https://api.resend.com/emails/${emailId}/attachments/${att.attachment_id}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        )
        if (response.ok && response.body) {
          await env.R2.put(r2Key, response.body, {
            httpMetadata: { contentType: att.content_type ?? 'application/octet-stream' },
          })
          await env.DB.prepare(
            `INSERT INTO attachments (id, email_id, filename, content_type, r2_object_key) VALUES (?, ?, ?, ?, ?)`
          ).bind(nanoid(), emailId, filename, att.content_type ?? null, r2Key).run()
        }
      }
    } catch (err) {
      console.error('[webhook] Attachment error:', err)
    }
  }
}

function sanitizeFilename(filename: string): string {
  const base = filename.split('/').pop() ?? 'file'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

/**
 * Trigger an AI-generated auto-reply for inbound emails when auto_reply_enabled = 1.
 *
 * Sender resolution priority:
 * 1. Default sender from account_senders table (most specific)
 * 2. account.from_email (configured custom address)
 * 3. noreply@domain (last resort)
 */
async function triggerAutoReply(
  env: Bindings,
  account: Account,
  emailId: string,
  emailData: Record<string, unknown>,
  bodyText: string
): Promise<void> {
  try {
    // Resolve the best "from" address — prefer the designated default sender
    const defaultSender = await env.DB.prepare(
      `SELECT name, email FROM account_senders WHERE account_id = ? AND is_default = 1 LIMIT 1`
    ).bind(account.id).first<{ name: string; email: string }>()

    const fromName  = defaultSender?.name  ?? account.from_name
    const fromEmail = defaultSender?.email ?? account.from_email ?? `noreply@${account.domain}`
    const fromHeader = `${fromName} <${fromEmail}>`

    const aiResponse = await (env.AI as Ai).run(
      account.ai_model || '@cf/meta/llama-3.2-3b-instruct',
      {
        messages: [
          { role: 'system', content: account.ai_system_prompt },
          {
            role: 'user',
            content: `Write a professional reply to this email. Return only the reply body — no subject line, no "Re:" prefix.\n\nFrom: ${emailData['from']}\nSubject: ${emailData['subject']}\n\n${bodyText.slice(0, 2000)}`,
          },
        ],
        max_tokens: 500,
      } as Parameters<Ai['run']>[1]
    )

    // Strip DeepSeek R1 reasoning tags
    const raw = (aiResponse as { response?: string }).response ?? ''
    const draft = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (!draft) return

    const apiKey = await decryptApiKey(account.resend_api_key_enc, env.MASTER_ENCRYPTION_KEY)
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: fromHeader,
      to: [extractEmail(String(emailData['from'] ?? ''))],
      subject: `Re: ${String(emailData['subject'] ?? '')}`,
      text: draft,
      headers: {
        'In-Reply-To': String(emailData['message_id'] ?? ''),
        References:    String(emailData['message_id'] ?? ''),
      },
    })
  } catch (err) {
    console.error('[auto-reply] Error:', err)
  }
}
