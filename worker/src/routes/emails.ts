import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { Bindings, Email } from '../types'

export const emailRoutes = new Hono<{ Bindings: Bindings }>()

const listSchema = z.object({
  accountId: z.string(),
  folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'archive']).optional().default('inbox'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
})

// GET /api/emails — list emails
emailRoutes.get('/', zValidator('query', listSchema), async (c) => {
  const { accountId, folder, page, limit } = c.req.valid('query')
  const offset = (page - 1) * limit

  const { results } = await c.env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.email_id = e.id) as attachment_count
    FROM emails e
    WHERE e.account_id = ? AND e.folder = ?
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(accountId, folder, limit, offset).all<Email & { attachment_count: number }>()

  return c.json({ success: true, data: results })
})

// GET /api/emails/search — FTS5 full-text search
emailRoutes.get('/search', async (c) => {
  const q = c.req.query('q')
  const accountId = c.req.query('accountId')

  if (!q || !accountId) {
    return c.json({ success: false, error: 'q and accountId are required' }, 400)
  }

  const { results } = await c.env.DB.prepare(`
    SELECT e.* FROM emails e
    JOIN emails_fts ON emails_fts.rowid = e.rowid
    WHERE emails_fts MATCH ? AND e.account_id = ?
    ORDER BY rank
    LIMIT 50
  `).bind(`"${q.replace(/"/g, '""')}"`, accountId).all<Email>()

  return c.json({ success: true, data: results })
})

// GET /api/emails/:id — single email with attachments
emailRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const email = await c.env.DB.prepare(`SELECT * FROM emails WHERE id = ?`)
    .bind(id).first<Email>()

  if (!email) return c.json({ success: false, error: 'Email not found' }, 404)

  const { results: attachments } = await c.env.DB.prepare(
    `SELECT id, filename, content_type, size_bytes FROM attachments WHERE email_id = ?`
  ).bind(id).all()

  // Mark as read
  await c.env.DB.prepare(`UPDATE emails SET read_status = 1 WHERE id = ?`).bind(id).run()

  return c.json({ success: true, data: { ...email, attachments } })
})

// PUT /api/emails/:id/read — toggle read status
emailRoutes.put('/:id/read', async (c) => {
  const id = c.req.param('id')
  const { read } = await c.req.json<{ read: boolean }>()

  await c.env.DB.prepare(`UPDATE emails SET read_status = ? WHERE id = ?`)
    .bind(read ? 1 : 0, id).run()

  return c.json({ success: true, data: null })
})

// PUT /api/emails/:id/folder — move to folder
emailRoutes.put('/:id/folder', async (c) => {
  const id = c.req.param('id')
  const { folder } = await c.req.json<{ folder: string }>()

  const validFolders = ['inbox', 'sent', 'drafts', 'trash', 'archive']
  if (!validFolders.includes(folder)) {
    return c.json({ success: false, error: 'Invalid folder' }, 400)
  }

  await c.env.DB.prepare(`UPDATE emails SET folder = ? WHERE id = ?`).bind(folder, id).run()

  return c.json({ success: true, data: null })
})

// DELETE /api/emails/:id — permanent delete (only from trash)
emailRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const email = await c.env.DB.prepare(`SELECT folder FROM emails WHERE id = ?`)
    .bind(id).first<{ folder: string }>()

  if (!email) return c.json({ success: false, error: 'Email not found' }, 404)
  if (email.folder !== 'trash') {
    return c.json({ success: false, error: 'Can only permanently delete emails in trash' }, 400)
  }

  // Cascade: attachments deleted via FK ON DELETE CASCADE
  await c.env.DB.prepare(`DELETE FROM emails WHERE id = ?`).bind(id).run()

  return c.json({ success: true, data: null })
})
