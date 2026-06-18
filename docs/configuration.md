# Configuration Reference

All sensitive configuration is managed via **Wrangler Secrets**.
Non-sensitive settings live in `wrangler.jsonc` at the repo root.

---

## Secrets (via `wrangler secret put`)

| Secret | Required | How to generate |
|---|---|---|
| `MASTER_ENCRYPTION_KEY` | ✅ | `node scripts/setup-secrets.mjs` — 64-char hex, used to AES-256-GCM encrypt Resend API keys at rest in D1 |
| `JWT_SECRET` | ✅ | `node scripts/setup-secrets.mjs` — 96-char random hex, signs login session JWTs |
| `ADMIN_USERNAME` | ✅ | Your chosen login username (e.g. `admin`) |
| `ADMIN_PASSWORD_HASH` | ✅ | `node scripts/setup-secrets.mjs` — SHA-256 hex hash of your admin password |

To rotate any secret:

```bash
npx wrangler secret put SECRET_NAME --env="" --config wrangler.jsonc
# Type the new value when prompted
```

Changes take effect on the next Worker request — no redeploy needed.

> **Always include `--env=""`** — this targets the top-level production environment, not the `development` block in `wrangler.jsonc`.

---

## Environment Variables (`wrangler.jsonc` `[vars]`)

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `production` | Used for logging/debugging. Set to `development` for local dev |

---

## Cloudflare Bindings (`wrangler.jsonc`)

| Binding | Type | Description |
|---|---|---|
| `DB` | D1 Database | SQLite database for emails, accounts, attachments, templates, senders |
| `R2` | R2 Bucket | Object storage for email attachment files |
| `AI` | Workers AI | Llama 3.2 3B / DeepSeek R1 for AI features |
| `ASSETS` | Static Assets | Serves the React SPA frontend |

---

## Local Development Variables (`.dev.vars`)

The file `.dev.vars` at the **repo root** holds secrets for local development.
It is gitignored and never committed.

```bash
# Generate it automatically
node scripts/setup-secrets.mjs

# Or copy the example and fill in manually
cp .dev.vars.example .dev.vars
```

Format:

```ini
MASTER_ENCRYPTION_KEY=<64-char hex>
JWT_SECRET=<96-char hex>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<sha256 hex>
ENVIRONMENT=development
```

---

## AI Model Configuration

Each account in the Admin panel can have its own AI model. Available Cloudflare Workers AI models:

| Model | ID | Notes |
|---|---|---|
| Llama 3.2 3B (default) | `@cf/meta/llama-3.2-3b-instruct` | Fast, low-cost |
| Llama 3.1 8B | `@cf/meta/llama-3.1-8b-instruct` | Higher quality |
| DeepSeek R1 Qwen 7B | `@cf/deepseek/deepseek-r1-distill-qwen-7b` | Best for complex drafts |

> DeepSeek R1 models emit `<think>...</think>` reasoning blocks — these are automatically stripped before output is returned to the client.

---

## Per-Account Sender Identities

Each account supports multiple sender identities (name + email pairs). The designated **default sender** is used for:
- The "From" field when composing new emails
- Auto-reply messages (if enabled)

Configure via **Admin → [Account] → Sender Identities**.
