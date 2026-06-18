# Contributing to resend-client

Thank you for your interest in contributing! Here's how to get started.

---

## Development Setup

1. Fork and clone the repository
2. Follow the [Setup Guide](docs/setup.md) for local development
3. Create a feature branch: `git checkout -b feat/your-feature`

---

## Project Structure

```
resend-client/
├── worker/src/
│   ├── routes/          # Hono API route handlers
│   │   ├── ai.ts        # AI endpoints (draft, summarize, tone, custom-prompt, quick-reply)
│   │   ├── send.ts      # Email send + draft
│   │   ├── emails.ts    # Email CRUD + FTS5 search
│   │   ├── webhooks.ts  # Inbound email + delivery events
│   │   └── settings.ts  # Account + sender identity management
│   ├── lib/             # Shared utilities (threading, crypto, db-init)
│   ├── db.ts            # D1 schema + auto-initialization
│   └── index.ts         # Worker entrypoint
├── frontend/src/
│   ├── components/      # React components
│   │   ├── Composer.tsx # Email compose/reply with AI panel
│   │   └── QuickReply.tsx
│   ├── queries.ts       # TanStack Query hooks (all server state)
│   ├── store.ts         # Zustand store (ephemeral UI state)
│   └── App.tsx
├── scripts/
│   └── setup-secrets.mjs  # One-time secret generation
├── docs/
│   ├── setup.md
│   └── configuration.md
└── wrangler.jsonc         # Cloudflare Worker config (at repo root)
```

---

## Pull Request Guidelines

- **One concern per PR** — one feature or bugfix, not multiple unrelated changes
- **Clear description** — explain what changed and why, not just what
- **TypeScript strict** — both `frontend` and `worker` must pass `tsc --noEmit`
- **Build passes** — run `pnpm build` before submitting
- **Test locally** — run `pnpm dev` and verify the change works end-to-end

### Checklist before submitting

```bash
# Type check both packages
pnpm --filter frontend exec tsc --noEmit
pnpm --filter worker exec tsc --noEmit

# Build the frontend
pnpm build
```

---

## Adding a New API Route

Follow the existing pattern in `worker/src/routes/`:

1. Create `worker/src/routes/your-route.ts` — export a `new Hono()` instance
2. Mount it in `worker/src/index.ts` with `app.route('/api/your-path', yourRoutes)`
3. Add the corresponding TanStack Query hook in `frontend/src/queries.ts`

---

## Code Style

- **TypeScript strict mode** — no `any` types, no `@ts-ignore`
- **No default exports from route files** — use named exports for Hono instances
- **Backend**: Follow existing patterns in `worker/src/routes/` for route handlers
- **Frontend**: Components go in `frontend/src/components/`, hooks in `queries.ts` or `store.ts`
- **Mutations = `useMutation`** — never use `useQuery` for POST/PUT/DELETE operations

---

## Reporting Issues

Use GitHub Issues for:
- **Bug reports** — include steps to reproduce, expected vs actual behavior, and browser/OS info
- **Feature requests** — describe the use case and why it matters

---

## Security Issues

Please **do not** open public GitHub issues for security vulnerabilities.
Email the maintainer directly instead.
