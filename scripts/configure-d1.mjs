#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/configure-d1.mjs
//
// Auto-configures the D1 database_id in wrangler.jsonc before deployment.
// Called during the build step in both:
//   - Cloudflare "Deploy to Cloudflare" button (deploy.json)
//   - GitHub Actions CI (deploy.yml)
//
// Strategy:
//   1. List existing D1 databases via wrangler
//   2. If resend-client-db exists → grab its ID
//   3. If not → create it and grab its ID
//   4. Patch wrangler.jsonc with the correct database_id
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_NAME = 'resend-client-db'
const WRANGLER_CONFIG = resolve(__dirname, '..', 'wrangler.jsonc')

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

console.log(`\n🔧  Configuring D1 database: ${DB_NAME}\n`)

try {
  // ── 1. List existing D1 databases ──────────────────────────────────────────
  let databases = []
  try {
    const listJson = run('npx wrangler d1 list --json')
    databases = JSON.parse(listJson)
  } catch {
    // wrangler d1 list might print warnings to stdout mixed with JSON
    // Try to extract just the JSON array
    try {
      const raw = run('npx wrangler d1 list --json 2>/dev/null')
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) databases = JSON.parse(match[0])
    } catch {
      databases = []
    }
  }

  // ── 2. Find or create the database ─────────────────────────────────────────
  let db = databases.find(
    (d) => d.name === DB_NAME || d.title === DB_NAME
  )

  let dbId

  if (db) {
    // Already exists — grab the ID (field name varies by wrangler version)
    dbId = db.uuid ?? db.database_id ?? db.id
    console.log(`✅  Found existing database: ${DB_NAME} (${dbId})`)
  } else {
    // Create it
    console.log(`📦  Creating new database: ${DB_NAME}`)
    try {
      const createJson = run(`npx wrangler d1 create ${DB_NAME} --json`)
      const created = JSON.parse(createJson)
      dbId = created.uuid ?? created.database_id ?? created.id
      console.log(`✅  Created database: ${DB_NAME} (${dbId})`)
    } catch (createErr) {
      // If creation fails because it already exists (race condition), re-list
      console.warn('⚠️  Create failed, re-listing...')
      const retryJson = run('npx wrangler d1 list --json')
      const retryList = JSON.parse(retryJson)
      db = retryList.find((d) => d.name === DB_NAME || d.title === DB_NAME)
      if (!db) throw new Error(`Could not create or find database "${DB_NAME}"`)
      dbId = db.uuid ?? db.database_id ?? db.id
      console.log(`✅  Found database on retry: ${DB_NAME} (${dbId})`)
    }
  }

  if (!dbId) {
    throw new Error('Database was found/created but ID could not be determined')
  }

  // ── 3. Patch wrangler.jsonc ─────────────────────────────────────────────────
  let config = readFileSync(WRANGLER_CONFIG, 'utf8')
  const original = config

  config = config.replace(
    /"database_id"\s*:\s*"[^"]*"/,
    `"database_id": "${dbId}"`
  )

  if (config === original) {
    throw new Error('Could not find "database_id" field in wrangler.jsonc to replace')
  }

  writeFileSync(WRANGLER_CONFIG, config)
  console.log(`✅  Updated wrangler.jsonc → database_id: ${dbId}\n`)

} catch (err) {
  // Don't hard-fail the build — wrangler may already have the binding configured
  // at the account level (e.g. via Cloudflare's deploy button UI)
  console.warn('\n⚠️  Could not auto-configure D1 database ID:')
  console.warn(`   ${err.message}`)
  console.warn('   Proceeding with existing wrangler.jsonc configuration.\n')
}
