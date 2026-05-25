// Resolve agent open_id → real name via Lark contact API.
// Strategy: cached + pre-warm (fire-and-forget) so webhook stays <3s.
// Required scope: contact:user.base:readonly

const LARK_HOST = process.env.LARK_DOMAIN ?? 'https://open.feishu.cn'

const nameCache = new Map<string, { name: string; expireAt: number }>()
const pending = new Set<string>()

const TTL_MS = 30 * 60 * 1000  // 30 min

function fallback(openId: string): string {
  return `客服-${openId.slice(-6)}`
}

export function getCachedName(openId: string): string {
  const entry = nameCache.get(openId)
  if (entry && entry.expireAt > Date.now()) return entry.name
  return fallback(openId)
}

// Trigger background fetch. Returns immediately. Next caller of getCachedName
// will get the real name once fetch resolves.
export function preWarmName(openId: string): void {
  const entry = nameCache.get(openId)
  if (entry && entry.expireAt > Date.now()) return
  if (pending.has(openId)) return
  pending.add(openId)
  fetchUserName(openId)
    .then((name) => {
      nameCache.set(openId, { name, expireAt: Date.now() + TTL_MS })
    })
    .catch((e) => console.warn('[lark contact] fail:', e.message ?? e))
    .finally(() => pending.delete(openId))
}

async function fetchUserName(openId: string): Promise<string> {
  const appId = process.env.LARK_APP_ID
  const appSecret = process.env.LARK_APP_SECRET
  if (!appId || !appSecret) throw new Error('LARK_APP_ID/SECRET missing')

  // get tenant_access_token (independent cache; small overhead)
  const tokRes = await fetch(`${LARK_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const tokJson = await tokRes.json() as { code: number; msg: string; tenant_access_token?: string }
  if (tokJson.code !== 0 || !tokJson.tenant_access_token) throw new Error(`token: ${tokJson.msg}`)

  const url = `${LARK_HOST}/open-apis/contact/v3/users/${openId}?user_id_type=open_id`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tokJson.tenant_access_token}` } })
  const json = await res.json() as { code: number; msg: string; data?: { user?: { name?: string } } }
  if (json.code !== 0) throw new Error(`contact ${json.code}: ${json.msg}`)
  const name = json.data?.user?.name
  if (!name) throw new Error('user.name missing in response')
  return name
}
