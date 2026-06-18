// AES-256-GCM encryption for Resend API keys stored in D1
// Uses Web Crypto API — available natively in Cloudflare Workers runtime
// MASTER_ENCRYPTION_KEY is a Worker Secret and never stored in the DB

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256

async function importKey(masterKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(masterKey.slice(0, 64).padEnd(64, '0'))
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptApiKey(plaintext: string, masterKey: string): Promise<string> {
  const key = await importKey(masterKey)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded)

  // Return as hex: iv (24 chars) + ciphertext
  return bytesToHex(iv) + bytesToHex(new Uint8Array(ciphertext))
}

export async function decryptApiKey(encrypted: string, masterKey: string): Promise<string> {
  const key = await importKey(masterKey)
  const iv = hexToBytes(encrypted.slice(0, 24))
  const ciphertext = hexToBytes(encrypted.slice(24))

  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)

  return new TextDecoder().decode(plaintext)
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '***'
  return key.slice(0, 8) + '*'.repeat(Math.min(key.length - 8, 20))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
