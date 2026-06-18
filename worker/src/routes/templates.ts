import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { Bindings, Template } from '../types'

export const templateRoutes = new Hono<{ Bindings: Bindings }>()

// GET /api/templates?accountId=X
templateRoutes.get('/', async (c) => {
  const accountId = c.req.query('accountId')
  if (!accountId) return c.json({ success: false, error: 'accountId required' }, 400)

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, subject_template, created_at FROM templates WHERE account_id = ? ORDER BY name ASC`
  ).bind(accountId).all<Template>()

  return c.json({ success: true, data: results })
})

// POST /api/templates
templateRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    accountId: string
    name: string
    subjectTemplate?: string
    bodyTemplate: string
  }>()

  const id = nanoid()
  await c.env.DB.prepare(`
    INSERT INTO templates (id, account_id, name, subject_template, body_template)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, body.accountId, body.name, body.subjectTemplate ?? null, body.bodyTemplate).run()

  return c.json({ success: true, data: { id } }, 201)
})

// PUT /api/templates/:id
templateRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    name?: string
    subjectTemplate?: string
    bodyTemplate?: string
  }>()

  await c.env.DB.prepare(`
    UPDATE templates SET
      name = COALESCE(?, name),
      subject_template = COALESCE(?, subject_template),
      body_template = COALESCE(?, body_template),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(body.name ?? null, body.subjectTemplate ?? null, body.bodyTemplate ?? null, id).run()

  return c.json({ success: true, data: null })
})

// DELETE /api/templates/:id
templateRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare(`DELETE FROM templates WHERE id = ?`).bind(id).run()
  return c.json({ success: true, data: null })
})
