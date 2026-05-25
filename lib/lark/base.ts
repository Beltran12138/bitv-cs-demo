// Lark Multi-base (Bitable) record ops
// Docs: https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record

const LARK_HOST = process.env.LARK_DOMAIN ?? 'https://open.feishu.cn'

async function fetchToken(): Promise<string> {
  const appId = process.env.LARK_APP_ID
  const appSecret = process.env.LARK_APP_SECRET
  if (!appId || !appSecret) throw new Error('LARK_APP_ID / LARK_APP_SECRET not configured')
  const res = await fetch(`${LARK_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const json = await res.json() as { code: number; tenant_access_token?: string; msg: string }
  if (json.code !== 0 || !json.tenant_access_token) throw new Error(`base token: ${json.msg}`)
  return json.tenant_access_token
}

// Lightweight token cache for base ops (separate from client.ts to avoid coupling)
type T = { token: string; expireAt: number } | null
let _t: T = null
async function token(): Promise<string> {
  const now = Date.now()
  if (_t && _t.expireAt > now + 60_000) return _t.token
  const tok = await fetchToken()
  _t = { token: tok, expireAt: now + 7200_000 - 300_000 }
  return tok
}

type BaseEnv = { appToken: string; tableId: string }

function env(): BaseEnv {
  const appToken = process.env.LARK_BASE_APP_TOKEN
  const tableId = process.env.LARK_BASE_TABLE_ID
  if (!appToken || !tableId) throw new Error('LARK_BASE_APP_TOKEN / LARK_BASE_TABLE_ID not configured')
  return { appToken, tableId }
}

export type CustomerFields = {
  session_id: string
  user_anon: string
  intent: string
  status: 'bot' | 'waiting' | 'human' | 'closed'
  start_at?: number   // ms timestamp
  last_msg_at?: number
  agent_user?: string
  messages_count?: number
  notes?: string
}

export async function createCustomerRecord(fields: CustomerFields): Promise<{ record_id: string }> {
  const { appToken, tableId } = env()
  const tok = await token()
  const res = await fetch(
    `${LARK_HOST}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ fields: normalize(fields) }),
    }
  )
  const json = await res.json() as { code: number; msg: string; data?: { record: { record_id: string } } }
  if (json.code !== 0 || !json.data) throw new Error(`base create: ${json.msg}`)
  return { record_id: json.data.record.record_id }
}

export async function updateCustomerRecord(
  recordId: string,
  fields: Partial<CustomerFields>
): Promise<void> {
  const { appToken, tableId } = env()
  const tok = await token()
  const res = await fetch(
    `${LARK_HOST}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ fields: normalize(fields) }),
    }
  )
  const json = await res.json() as { code: number; msg: string }
  if (json.code !== 0) throw new Error(`base update: ${json.msg}`)
}

export async function getCustomerRecord(recordId: string): Promise<CustomerFields | null> {
  const { appToken, tableId } = env()
  const tok = await token()
  const res = await fetch(
    `${LARK_HOST}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { headers: { Authorization: `Bearer ${tok}` } }
  )
  const json = await res.json() as { code: number; data?: { record: { fields: CustomerFields } } }
  if (json.code !== 0 || !json.data) return null
  return json.data.record.fields
}

// Find record by session_id (linear search, demo-scale fine)
export async function findRecordBySessionId(sessionId: string): Promise<{ record_id: string; fields: CustomerFields } | null> {
  const { appToken, tableId } = env()
  const tok = await token()
  const res = await fetch(
    `${LARK_HOST}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        filter: {
          conjunction: 'and',
          conditions: [
            { field_name: 'session_id', operator: 'is', value: [sessionId] },
          ],
        },
        page_size: 1,
      }),
    }
  )
  const json = await res.json() as {
    code: number
    msg: string
    data?: { items?: Array<{ record_id: string; fields: CustomerFields }> }
  }
  if (json.code !== 0) throw new Error(`base search: ${json.msg}`)
  const item = json.data?.items?.[0]
  return item ? { record_id: item.record_id, fields: decodeFields(item.fields) } : null
}

function normalize(fields: Partial<CustomerFields>): Record<string, unknown> {
  // Lark base expects single-select 'status' as the option text directly.
  // Number/text/date pass through as-is (date as ms ts).
  const out: Record<string, unknown> = { ...fields }
  return out
}

// Lark base returns text fields as [{ text: '...', type: 'text' }] segments.
// Flatten to plain strings.
function decodeFields(raw: unknown): CustomerFields {
  const out: Record<string, unknown> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        out[k] = v.map((seg) => (seg && typeof seg === 'object' && 'text' in seg) ? (seg as { text: string }).text : String(seg)).join('')
      } else {
        out[k] = v
      }
    }
  }
  return out as CustomerFields
}
