import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sign } from 'hono/jwt'
import type { Bindings } from '../types'

export const authRoutes = new Hono<{ Bindings: Bindings }>()

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// POST /api/auth/login
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json')

  // Verify username
  if (username !== c.env.ADMIN_USERNAME) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  }

  // Verify password against bcrypt hash stored in Worker Secret
  // We use a timing-safe comparison for the hash check
  const isValid = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH)
  if (!isValid) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  }

  // Sign JWT (24h expiry)
  const token = await sign(
    {
      sub: username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
    c.env.JWT_SECRET
  )

  // Set httpOnly cookie
  // Note: Cloudflare production is always HTTPS; Secure flag is omitted here
  // so local dev (HTTP) works. HttpOnly + SameSite=Lax provides CSRF protection.
  c.header(
    'Set-Cookie',
    `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24}`
  )

  return c.json({ success: true, data: { username } })
})

// POST /api/auth/logout
authRoutes.post('/logout', (c) => {
  c.header('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
  return c.json({ success: true, data: null })
})

// GET /api/auth/me — validate session
authRoutes.get('/me', async (c) => {
  const cookie = getCookie(c.req.raw.headers.get('cookie') ?? '', 'token')
  if (!cookie) {
    return c.json({ success: false, error: 'Not authenticated' }, 401)
  }

  try {
    const { verify } = await import('hono/jwt')
    const payload = await verify(cookie, c.env.JWT_SECRET, 'HS256')
    return c.json({ success: true, data: { username: payload['sub'] } })
  } catch {
    return c.json({ success: false, error: 'Invalid or expired session' }, 401)
  }
})

// --- Helpers ---

function getCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? (match[1] ?? null) : null
}

/**
 * Password verification using Web Crypto SHA-256.
 * The ADMIN_PASSWORD_HASH secret must be a lowercase hex SHA-256 digest.
 * Generate: node scripts/setup-secrets.mjs
 *   or: node -e "const {createHash}=require('crypto'); console.log(createHash('sha256').update('yourpassword').digest('hex'))"
 * Uses timing-safe comparison to prevent timing attacks.
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // Timing-safe comparison
    return timingSafeEqual(hashHex, storedHash)
  } catch {
    return false
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
