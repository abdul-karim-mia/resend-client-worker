import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { Bindings, AccountSender } from '../types'

export const senderRoutes = new Hono<{ Bindings: Bindings }>()

// GET /api/admin/accounts/:id/senders
senderRoutes.get('/', async (c) => {
  const accountId = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM account_senders WHERE account_id = ? ORDER BY is_default DESC, created_at ASC`
  ).bind(accountId).all<AccountSender>()

  return c.json({ success: true, data: results })
})

// POST /api/admin/accounts/:id/senders
senderRoutes.post('/', async (c) => {
  const accountId = c.req.param('id')
  const body = await c.req.json<{ name: string; email: string; isDefault?: boolean }>()

  if (!body.name?.trim() || !body.email?.trim()) {
    return c.json({ success: false, error: 'name and email are required' }, 400)
  }

  // Check account exists
  const account = await c.env.DB.prepare(`SELECT id FROM accounts WHERE id = ?`)
    .bind(accountId).first()
  if (!account) return c.json({ success: false, error: 'Account not found' }, 404)

  const id = `sndr_${nanoid(10)}`

  // If setting as default, clear existing defaults first
  if (body.isDefault) {
    await c.env.DB.prepare(`UPDATE account_senders SET is_default = 0 WHERE account_id = ?`)
      .bind(accountId).run()
  }

  // If this is the first sender, make it default automatically
  const { count } = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM account_senders WHERE account_id = ?`
  ).bind(accountId).first<{ count: number }>() ?? { count: 0 }

  const isDefault = body.isDefault || count === 0 ? 1 : 0

  await c.env.DB.prepare(
    `INSERT INTO account_senders (id, account_id, name, email, is_default) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, accountId, body.name.trim(), body.email.trim(), isDefault).run()

  return c.json({ success: true, data: { id, name: body.name, email: body.email, is_default: isDefault } }, 201)
})

// DELETE /api/admin/accounts/:id/senders/:senderId
senderRoutes.delete('/:senderId', async (c) => {
  const accountId = c.req.param('id')
  const senderId = c.req.param('senderId')
  await c.env.DB.prepare(`DELETE FROM account_senders WHERE id = ? AND account_id = ?`)
    .bind(senderId, accountId).run()
  return c.json({ success: true, data: null })
})

// PATCH /api/admin/accounts/:id/senders/:senderId/default — set as default
senderRoutes.patch('/:senderId/default', async (c) => {
  const accountId = c.req.param('id')
  const senderId = c.req.param('senderId')
  // Clear all defaults for this account
  await c.env.DB.prepare(`UPDATE account_senders SET is_default = 0 WHERE account_id = ?`)
    .bind(accountId).run()
  // Set the selected one
  await c.env.DB.prepare(`UPDATE account_senders SET is_default = 1 WHERE id = ? AND account_id = ?`)
    .bind(senderId, accountId).run()
  return c.json({ success: true, data: null })
})
