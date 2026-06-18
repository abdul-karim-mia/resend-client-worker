import { Hono } from 'hono'
import { Resend } from 'resend'
import { decryptApiKey } from '../lib/crypto'
import type { Bindings, Account } from '../types'

export const resendTemplateRoutes = new Hono<{ Bindings: Bindings }>()

// GET /api/templates/resend?accountId=X — list Resend-hosted templates
resendTemplateRoutes.get('/', async (c) => {
  const accountId = c.req.query('accountId')
  if (!accountId) return c.json({ success: false, error: 'accountId required' }, 400)

  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`)
    .bind(accountId).first<Account>()
  if (!account) return c.json({ success: false, error: 'Account not found' }, 404)

  const apiKey = await decryptApiKey(account.resend_api_key_enc, c.env.MASTER_ENCRYPTION_KEY)
  const resend = new Resend(apiKey)

  try {
    const { data, error } = await resend.templates.list()
    if (error) {
      console.warn(`[Resend Templates List Warning] Failed to fetch templates for account ${accountId}: ${error.message}`)
      return c.json({ success: true, data: [] })
    }
    return c.json({ success: true, data: data?.data ?? [] })
  } catch (err: any) {
    console.warn(`[Resend Templates List Catch] Failed to fetch templates for account ${accountId}: ${err.message}`)
    return c.json({ success: true, data: [] })
  }
})

// GET /api/templates/resend/:id?accountId=X — get single template (includes variables)
resendTemplateRoutes.get('/:id', async (c) => {
  const templateId = c.req.param('id')
  const accountId = c.req.query('accountId')
  if (!accountId) return c.json({ success: false, error: 'accountId required' }, 400)

  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`)
    .bind(accountId).first<Account>()
  if (!account) return c.json({ success: false, error: 'Account not found' }, 404)

  const apiKey = await decryptApiKey(account.resend_api_key_enc, c.env.MASTER_ENCRYPTION_KEY)
  const resend = new Resend(apiKey)

  const { data, error } = await resend.templates.get(templateId)
  if (error) return c.json({ success: false, error: error.message }, 400)

  return c.json({ success: true, data })
})
