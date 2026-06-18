import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { jwt } from 'hono/jwt'
import type { Bindings } from './types'

// Route imports
import { authRoutes } from './routes/auth'
import { webhookRoutes } from './routes/webhooks'
import { emailRoutes } from './routes/emails'
import { sendRoutes } from './routes/send'
import { aiRoutes } from './routes/ai'
import { attachmentRoutes } from './routes/attachments'
import { templateRoutes } from './routes/templates'
import { resendTemplateRoutes } from './routes/resend-templates'
import { settingsRoutes } from './routes/settings'
import { senderRoutes } from './routes/senders'
import { ensureDbInitialized } from './db'

const app = new Hono<{ Bindings: Bindings }>()

let dbChecked = false

// Auto-initialize DB on first request
app.use('*', async (c, next) => {
  if (!dbChecked && c.env.DB) {
    await ensureDbInitialized(c.env.DB)
    dbChecked = true
  }
  await next()
})

// Global middleware
// Note: credentials:true requires explicit origins, not '*'
app.use('*', cors({
  origin: (origin) => {
    // Allow same-origin requests (no Origin header) and trusted origins
    if (!origin) return '*'
    const allowed = [
      'http://localhost:5173',
      'http://localhost:8787',
      'https://resend-client-worker.workers.dev',
    ]
    return allowed.includes(origin) ? origin : allowed[0]
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.use('*', logger())

// Public routes (no auth required)
app.route('/api/auth', authRoutes)
app.route('/webhook', webhookRoutes) // Webhooks use their own HMAC verification

// Protected routes — JWT middleware
app.use('/api/*', async (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    cookie: 'token',
    alg: 'HS256',
  })
  return jwtMiddleware(c, next)
})

// Protected API routes
app.route('/api/emails', emailRoutes)
app.route('/api/send', sendRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/attachments', attachmentRoutes)
app.route('/api/templates', templateRoutes)
app.route('/api/templates/resend', resendTemplateRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/settings/accounts/:id/senders', senderRoutes)

// Global error handler
app.onError((err, c) => {
  console.error('[Worker Error]', err.message, err.stack)
  return c.json({ success: false, error: 'Internal server error' }, 500)
})

// Catch-all: serve React SPA static assets
app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
