// Thread ID resolution logic
// Groups emails into conversation threads using email header standards:
// - Message-ID: unique identifier for each email
// - In-Reply-To: references the Message-ID of the email being replied to
// - References: full chain of Message-IDs in the thread

import type { Bindings } from '../types'

/**
 * Finds or creates a thread_id for an incoming email.
 * If the email has an In-Reply-To header matching an existing email,
 * it joins that thread. Otherwise it starts a new thread.
 */
export async function resolveThreadId(
  db: D1Database,
  accountId: string,
  inReplyTo: string | null,
  references: string | null
): Promise<string> {
  // Try to find parent thread via In-Reply-To
  if (inReplyTo) {
    const parent = await db
      .prepare(`SELECT thread_id FROM emails WHERE message_id = ? AND account_id = ? LIMIT 1`)
      .bind(inReplyTo, accountId)
      .first<{ thread_id: string }>()

    if (parent) return parent.thread_id
  }

  // Try References header (full chain of message IDs) — batch query
  if (references) {
    const refIds = references
      .split(/\s+/)
      .map((r) => r.trim())
      .filter(Boolean)

    if (refIds.length > 0) {
      // Batch lookup — most recent ref (last) takes priority
      const placeholders = refIds.map(() => '?').join(', ')
      const parent = await db
        .prepare(
          `SELECT thread_id FROM emails WHERE message_id IN (${placeholders}) AND account_id = ? ORDER BY created_at DESC LIMIT 1`
        )
        .bind(...refIds, accountId)
        .first<{ thread_id: string }>()

      if (parent) return parent.thread_id
    }
  }

  // No parent found — start a new thread
  return crypto.randomUUID()
}
