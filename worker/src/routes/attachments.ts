import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { Bindings } from '../types'

export const attachmentRoutes = new Hono<{ Bindings: Bindings }>()

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

// GET /api/attachments/:id/download — stream file from R2
attachmentRoutes.get('/:id/download', async (c) => {
  const id = c.req.param('id')

  const attachment = await c.env.DB.prepare(
    `SELECT r2_object_key, filename, content_type FROM attachments WHERE id = ?`
  ).bind(id).first<{ r2_object_key: string; filename: string; content_type: string | null }>()

  if (!attachment) return c.json({ success: false, error: 'Attachment not found' }, 404)

  // Stream directly from R2
  const object = await c.env.R2.get(attachment.r2_object_key)
  if (!object) return c.json({ success: false, error: 'File not found in storage' }, 404)

  const safeFilename = encodeURIComponent(attachment.filename)

  return new Response(object.body, {
    headers: {
      'Content-Type': attachment.content_type ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': object.size.toString(),
    },
  })
})

// POST /api/attachments/upload — upload file to R2 (for outbound sending)
attachmentRoutes.post('/upload', async (c) => {
  const accountId = c.req.query('accountId')
  if (!accountId) return c.json({ success: false, error: 'accountId required' }, 400)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) return c.json({ success: false, error: 'No file provided' }, 400)

  // Size check (from file-uploads skill)
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ success: false, error: 'File too large (max 25MB)' }, 400)
  }

  // Sanitize filename (from file-uploads skill: never trust user filename directly)
  const safeFilename = file.name
    .split('/')
    .pop()!
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 200)

  const r2Key = `uploads/${accountId}/${nanoid()}_${safeFilename}`

  const buffer = await file.arrayBuffer()

  await c.env.R2.put(r2Key, buffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })

  return c.json({
    success: true,
    data: {
      key: r2Key,
      filename: safeFilename,
      size: file.size,
      contentType: file.type,
    },
  })
})
