// Lark event subscription: token verification + optional AES decryption + signature
// Docs: https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case

import crypto from 'crypto'

// Decrypt body when ENCRYPT_KEY is configured.
// Encrypted body shape: { "encrypt": "<base64-string>" }
export function decryptIfNeeded(rawBody: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(rawBody) } catch { return rawBody }
  if (!parsed || typeof parsed !== 'object' || !('encrypt' in parsed)) return rawBody

  const encryptKey = process.env.LARK_ENCRYPT_KEY
  if (!encryptKey) {
    throw new Error('event body is encrypted but LARK_ENCRYPT_KEY not set')
  }
  const encrypted = (parsed as { encrypt: string }).encrypt

  const key = crypto.createHash('sha256').update(encryptKey).digest()
  const buf = Buffer.from(encrypted, 'base64')
  const iv = buf.subarray(0, 16)
  const ciphertext = buf.subarray(16)

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}

// Verification token check — every event body contains `token` field
// or for schema 2.0 `header.token`
export function verifyToken(eventBody: unknown): boolean {
  const expected = process.env.LARK_VERIFICATION_TOKEN
  if (!expected) {
    // dev convenience: if not set, skip verification with a console warning
    console.warn('[lark] LARK_VERIFICATION_TOKEN not set — skipping token check (dev only!)')
    return true
  }
  if (!eventBody || typeof eventBody !== 'object') return false
  const body = eventBody as Record<string, unknown>
  if (typeof body.token === 'string') return body.token === expected
  const header = body.header as Record<string, unknown> | undefined
  if (header && typeof header.token === 'string') return header.token === expected
  return false
}

// Optional: signature verification (only when encryption is enabled)
// X-Lark-Signature = base64(sha256(timestamp + nonce + encrypt_key + body_raw))
export function verifySignature(
  timestamp: string | null,
  nonce: string | null,
  signature: string | null,
  rawBody: string
): boolean {
  const encryptKey = process.env.LARK_ENCRYPT_KEY
  if (!encryptKey) return true  // no encryption → no signature
  if (!timestamp || !nonce || !signature) return false

  const expected = crypto
    .createHash('sha256')
    .update(timestamp + nonce + encryptKey + rawBody)
    .digest('hex')

  return expected === signature
}
