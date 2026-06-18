-- ============================================================
-- resend-client D1 Schema
-- Run: pnpm db:apply (local) or pnpm db:apply:remote (production)
--
-- ⚠️  IMPORTANT: Keep in sync with worker/src/db.ts (ensureDbInitialized)
--    db.ts is the source of truth for auto-initialization in production.
--    If you add/modify tables here, update db.ts as well.
-- ============================================================

-- Accounts / Workspaces
CREATE TABLE IF NOT EXISTS accounts (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    domain              TEXT NOT NULL,
    from_name           TEXT NOT NULL DEFAULT 'Inbox',
    from_email          TEXT,                              -- custom sender e.g. support@domain.com; NULL = noreply@domain
    resend_api_key_enc  TEXT NOT NULL,
    webhook_secret      TEXT NOT NULL,
    ai_system_prompt    TEXT NOT NULL DEFAULT 'You are a helpful customer support agent. Be concise, polite, and professional.',
    auto_reply_enabled  INTEGER NOT NULL DEFAULT 0,
    ai_model            TEXT NOT NULL DEFAULT '@cf/meta/llama-3.2-3b-instruct',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Emails
CREATE TABLE IF NOT EXISTS emails (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    thread_id       TEXT NOT NULL,
    message_id      TEXT UNIQUE,
    in_reply_to     TEXT,
    folder          TEXT NOT NULL DEFAULT 'inbox',
    direction       TEXT NOT NULL DEFAULT 'inbound',
    sender_name     TEXT,
    sender_email    TEXT NOT NULL,
    recipient_to    TEXT NOT NULL DEFAULT '[]',
    recipient_cc    TEXT,
    recipient_bcc   TEXT,
    subject         TEXT,
    body_html       TEXT,
    body_text       TEXT,
    read_status     INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    resend_email_id TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_emails_account_folder ON emails(account_id, folder, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_resend_id ON emails(resend_email_id);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
    sender_name, sender_email, subject, body_text,
    content='emails', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS emails_fts_insert AFTER INSERT ON emails BEGIN
    INSERT INTO emails_fts(rowid, sender_name, sender_email, subject, body_text)
    VALUES (new.rowid, new.sender_name, new.sender_email, new.subject, new.body_text);
END;

CREATE TRIGGER IF NOT EXISTS emails_fts_update AFTER UPDATE ON emails BEGIN
    INSERT INTO emails_fts(emails_fts, rowid, sender_name, sender_email, subject, body_text)
    VALUES ('delete', old.rowid, old.sender_name, old.sender_email, old.subject, old.body_text);
    INSERT INTO emails_fts(rowid, sender_name, sender_email, subject, body_text)
    VALUES (new.rowid, new.sender_name, new.sender_email, new.subject, new.body_text);
END;

CREATE TRIGGER IF NOT EXISTS emails_fts_delete AFTER DELETE ON emails BEGIN
    INSERT INTO emails_fts(emails_fts, rowid, sender_name, sender_email, subject, body_text)
    VALUES ('delete', old.rowid, old.sender_name, old.sender_email, old.subject, old.body_text);
END;

-- Attachments (metadata only — files in R2)
CREATE TABLE IF NOT EXISTS attachments (
    id              TEXT PRIMARY KEY,
    email_id        TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    content_type    TEXT,
    size_bytes      INTEGER,
    r2_object_key   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id);

-- Email Templates
CREATE TABLE IF NOT EXISTS templates (
    id                TEXT PRIMARY KEY,
    account_id        TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    subject_template  TEXT,
    body_template     TEXT NOT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts (auto-populated)
CREATE TABLE IF NOT EXISTS contacts (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name            TEXT,
    email           TEXT NOT NULL,
    last_contacted  DATETIME,
    UNIQUE(account_id, email)
);

-- Account Senders (Sender Identities)
CREATE TABLE IF NOT EXISTS account_senders (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    is_default      INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_senders_account ON account_senders(account_id);
