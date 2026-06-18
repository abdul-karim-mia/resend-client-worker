// Worker Types — Cloudflare Bindings + App-wide TypeScript types

export type Bindings = {
  // Cloudflare
  DB: D1Database
  R2: R2Bucket
  AI: Ai
  ASSETS: Fetcher
  // Secrets
  MASTER_ENCRYPTION_KEY: string
  JWT_SECRET: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD_HASH: string
  // Vars
  ENVIRONMENT: string
}

// DB row types
export type Account = {
  id: string
  name: string
  domain: string
  from_name: string
  from_email: string | null  // e.g. support@domain.com — falls back to noreply@domain if null
  resend_api_key_enc: string
  webhook_secret: string
  ai_system_prompt: string
  auto_reply_enabled: number
  ai_model: string
  created_at: string
  updated_at: string
}

export type AccountSender = {
  id: string
  account_id: string
  name: string
  email: string
  is_default: number
  created_at: string
}

export type Email = {
  id: string
  account_id: string
  thread_id: string
  message_id: string | null
  in_reply_to: string | null
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive'
  direction: 'inbound' | 'outbound'
  sender_name: string | null
  sender_email: string
  recipient_to: string // JSON array
  recipient_cc: string | null
  recipient_bcc: string | null
  subject: string | null
  body_html: string | null
  body_text: string | null
  read_status: number
  delivery_status: 'pending' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed'
  resend_email_id: string | null
  created_at: string
}

export type Attachment = {
  id: string
  email_id: string
  filename: string
  content_type: string | null
  size_bytes: number | null
  r2_object_key: string
}

export type Template = {
  id: string
  account_id: string
  name: string
  subject_template: string | null
  body_template: string
  created_at: string
  updated_at: string
}

// API response wrapper
export type ApiSuccess<T> = { success: true; data: T }
export type ApiError = { success: false; error: string; details?: unknown }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// Auth types
export type JWTPayload = {
  sub: string // username
  iat: number
  exp: number
}
