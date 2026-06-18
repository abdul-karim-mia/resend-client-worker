import { Hono } from 'hono'
import type { Bindings } from '../types'

export const aiRoutes = new Hono<{ Bindings: Bindings }>()

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip <think>...</think> blocks produced by DeepSeek R1 reasoning models.
 * These should never appear in the output shown to users.
 */
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/**
 * Extract a JSON array from raw LLM output that may be wrapped in markdown
 * code fences or contain surrounding text.
 */
function extractJsonArray(raw: string): string[] {
  // Remove markdown fences like ```json ... ``` or ``` ... ```
  const stripped = raw.replace(/```(?:json)?[\r\n]?([\s\S]*?)```/g, '$1').trim()
  // Find the first [...] block
  const match = stripped.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed.map((s: unknown) => String(s).trim()).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Resolve the AI model for a given account, falling back to a safe default.
 */
async function resolveModel(db: D1Database, accountId?: string | null): Promise<string> {
  const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct'
  if (!accountId) {
    const acc = await db.prepare(`SELECT ai_model FROM accounts LIMIT 1`).first<{ ai_model: string }>()
    return acc?.ai_model ?? DEFAULT_MODEL
  }
  const acc = await db.prepare(`SELECT ai_model FROM accounts WHERE id = ?`).bind(accountId).first<{ ai_model: string }>()
  return acc?.ai_model ?? DEFAULT_MODEL
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/ai/draft-reply/:emailId — generate a full reply draft (AI copilot)
aiRoutes.post('/draft-reply/:emailId', async (c) => {
  const emailId = c.req.param('emailId')

  const row = await c.env.DB.prepare(`
    SELECT e.body_text, e.subject, e.sender_name, e.sender_email,
           a.ai_system_prompt, a.ai_model
    FROM emails e
    JOIN accounts a ON e.account_id = a.id
    WHERE e.id = ?
  `).bind(emailId).first<{
    body_text: string | null
    subject: string | null
    sender_name: string | null
    sender_email: string
    ai_system_prompt: string
    ai_model: string
  }>()

  if (!row) return c.json({ success: false, error: 'Email not found' }, 404)

  const prompt = `Write a professional, concise reply to this email. Return only the reply body — no subject line, no headers, no "Subject:" prefix.

Original email:
From: ${row.sender_name ? `${row.sender_name} <${row.sender_email}>` : row.sender_email}
Subject: ${row.subject ?? '(no subject)'}

${(row.body_text ?? '').slice(0, 3000)}`

  const result = await (c.env.AI as Ai).run(row.ai_model, {
    messages: [
      { role: 'system', content: row.ai_system_prompt },
      { role: 'user', content: prompt },
    ],
    max_tokens: 600,
    temperature: 0.7,
  } as Parameters<Ai['run']>[1])

  const draft = stripThinkTags((result as { response?: string }).response ?? '')

  return c.json({ success: true, data: { draft } })
})

// POST /api/ai/summarize/:threadId — summarize a thread in one sentence
aiRoutes.post('/summarize/:threadId', async (c) => {
  const threadId = c.req.param('threadId')

  const { results } = await c.env.DB.prepare(`
    SELECT e.body_text, a.ai_model FROM emails e
    JOIN accounts a ON e.account_id = a.id
    WHERE e.thread_id = ? AND e.body_text IS NOT NULL
    ORDER BY e.created_at ASC LIMIT 5
  `).bind(threadId).all<{ body_text: string; ai_model: string }>()

  if (results.length === 0) return c.json({ success: false, error: 'Thread not found' }, 404)

  const combined = results.map((r) => r.body_text).join('\n---\n').slice(0, 4000)
  const model = results[0]?.ai_model ?? '@cf/meta/llama-3.2-3b-instruct'

  const result = await (c.env.AI as Ai).run(model, {
    messages: [
      {
        role: 'system',
        content: 'Summarize email threads in exactly one concise sentence (max 80 characters). Return only the sentence — no punctuation at the end, no extra text.',
      },
      { role: 'user', content: `Summarize this email thread:\n\n${combined}` },
    ],
    max_tokens: 120,
    temperature: 0.3,
  } as Parameters<Ai['run']>[1])

  const summary = stripThinkTags((result as { response?: string }).response ?? '').slice(0, 120)

  return c.json({ success: true, data: { summary } })
})

// POST /api/ai/quick-reply-suggestions — 3 context-aware one-click reply chips
aiRoutes.post('/quick-reply-suggestions', async (c) => {
  const { emailId, accountId } = await c.req.json<{ emailId: string; accountId: string }>()
  if (!emailId || !accountId) {
    return c.json({ success: false, error: 'emailId and accountId required' }, 400)
  }

  // Fetch the full thread (up to 8 emails for context)
  const { results: thread } = await c.env.DB.prepare(`
    SELECT e.body_text, e.sender_name, e.sender_email, e.direction, e.subject
    FROM emails e
    WHERE e.thread_id = (
      SELECT thread_id FROM emails WHERE id = ? LIMIT 1
    )
    ORDER BY e.created_at ASC
    LIMIT 8
  `).bind(emailId).all<{
    body_text: string | null
    sender_name: string | null
    sender_email: string
    direction: string
    subject: string | null
  }>()

  const account = await c.env.DB.prepare(`SELECT ai_model, ai_system_prompt FROM accounts WHERE id = ?`)
    .bind(accountId).first<{ ai_model: string; ai_system_prompt: string }>()
  if (!account) return c.json({ success: false, error: 'Account not found' }, 404)

  const conversationContext = thread.map((m) =>
    `[${m.direction === 'inbound' ? 'RECEIVED' : 'SENT'}] ${m.sender_name || m.sender_email}:\n${(m.body_text ?? '').slice(0, 800)}`
  ).join('\n\n---\n\n')

  const prompt = `Based on this email conversation, generate exactly 3 short, natural, contextually appropriate one-click reply options.

Conversation:
${conversationContext.slice(0, 4000)}

Rules:
- Each reply must be under 60 characters
- Each reply must make sense as a standalone response to the last message
- Keep them natural, varied in tone (e.g. one brief acknowledgement, one action-oriented, one question/clarification)
- Return ONLY a valid JSON array of 3 strings. No markdown, no explanation.

Example format: ["Thanks for the update!", "I'll review and get back to you.", "Can you share more details?"]`

  const result = await (c.env.AI as Ai).run(account.ai_model, {
    messages: [
      {
        role: 'system',
        content: 'You are an email assistant. Return ONLY a valid JSON array of strings. No markdown code fences, no explanation, no preamble.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 200,
    temperature: 0.7,
  } as Parameters<Ai['run']>[1])

  const raw = stripThinkTags((result as { response?: string }).response ?? '[]')
  const FALLBACKS = ['Thanks!', 'Got it.', "I'll look into this."]

  let suggestions = extractJsonArray(raw)
  if (suggestions.length === 0) suggestions = [...FALLBACKS]

  // Normalise: max 3, max 80 chars each, always fill to 3
  suggestions = suggestions.slice(0, 3).map((s) => String(s).slice(0, 80))
  while (suggestions.length < 3) {
    suggestions.push(FALLBACKS[suggestions.length] ?? 'OK')
  }

  return c.json({ success: true, data: { suggestions } })
})

// POST /api/ai/adjust-tone — rewrite email body with a preset tone
aiRoutes.post('/adjust-tone', async (c) => {
  const { text, tone, accountId } = await c.req.json<{
    text: string
    tone: 'formal' | 'casual' | 'concise'
    accountId?: string
  }>()

  if (!text || !tone) {
    return c.json({ success: false, error: 'text and tone are required' }, 400)
  }

  const model = await resolveModel(c.env.DB, accountId)

  const toneInstructions: Record<string, string> = {
    formal:  'Rewrite the following email in a formal, professional tone. Use proper salutations, avoid contractions, and maintain a respectful register. Return only the rewritten email body.',
    casual:  'Rewrite the following email in a friendly, casual tone. Keep it warm, approachable, and conversational. Return only the rewritten email body.',
    concise: 'Rewrite the following email to be as concise as possible. Remove all filler words, redundancy, and unnecessary pleasantries. Keep only essential information. Return only the rewritten email body.',
  }

  const result = await (c.env.AI as Ai).run(model, {
    messages: [
      { role: 'system', content: toneInstructions[tone] },
      { role: 'user', content: text.slice(0, 3000) },
    ],
    max_tokens: 600,
    temperature: 0.6,
  } as Parameters<Ai['run']>[1])

  const rewritten = stripThinkTags((result as { response?: string }).response ?? '')

  return c.json({ success: true, data: { result: rewritten } })
})

// POST /api/ai/custom-prompt — apply a free-form AI instruction to the email body
// This is what the Composer's "Custom Prompt" panel actually calls.
aiRoutes.post('/custom-prompt', async (c) => {
  const { text, prompt, accountId } = await c.req.json<{
    text: string        // current editor body
    prompt: string      // user's free-form instruction
    accountId?: string
  }>()

  if (!prompt?.trim()) {
    return c.json({ success: false, error: 'prompt is required' }, 400)
  }

  const model = await resolveModel(c.env.DB, accountId)

  // System prompt: instruct the model to act as an email writing assistant
  const systemPrompt = `You are an expert email writing assistant. When given an email body and a user instruction, apply the instruction to the email and return only the improved email body. Do not add subject lines, headers, or explanations — just the rewritten body.`

  // If there's no current body, treat the prompt as the content to generate from scratch
  const userMessage = text?.trim()
    ? `Email body:\n"""\n${text.slice(0, 3000)}\n"""\n\nInstruction: ${prompt}`
    : `Write an email based on this instruction: ${prompt}`

  const result = await (c.env.AI as Ai).run(model, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 700,
    temperature: 0.7,
  } as Parameters<Ai['run']>[1])

  const output = stripThinkTags((result as { response?: string }).response ?? '')

  return c.json({ success: true, data: { result: output } })
})
