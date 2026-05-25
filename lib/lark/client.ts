// Lark OpenAPI client — tenant_access_token cache + send/reply message
// Docs: https://open.feishu.cn/document/server-docs/im-v1/message/create

const LARK_HOST = process.env.LARK_DOMAIN ?? 'https://open.feishu.cn'

type TokenState = { token: string; expireAt: number } | null
let _tokenState: TokenState = null

async function getTenantAccessToken(): Promise<string> {
  const now = Date.now()
  if (_tokenState && _tokenState.expireAt > now + 60_000) {
    return _tokenState.token
  }

  const appId = process.env.LARK_APP_ID
  const appSecret = process.env.LARK_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('LARK_APP_ID / LARK_APP_SECRET not configured')
  }

  const res = await fetch(`${LARK_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const json = await res.json() as { code: number; msg: string; tenant_access_token?: string; expire?: number }
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`lark token fetch failed: ${json.msg}`)
  }
  _tokenState = {
    token: json.tenant_access_token,
    expireAt: now + (json.expire ?? 7200) * 1000 - 300_000,
  }
  return _tokenState.token
}

type LarkResponse<T = unknown> = { code: number; msg: string; data?: T }

async function larkFetch<T = unknown>(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {}
): Promise<T> {
  const token = await getTenantAccessToken()
  const url = new URL(`${LARK_HOST}${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  const json = await res.json() as LarkResponse<T>
  if (json.code !== 0) {
    throw new Error(`lark api ${path} failed: code=${json.code} msg=${json.msg}`)
  }
  return json.data as T
}

// ─── messages ───────────────────────────────────────────────────────────

export type SendMessageInput = {
  receiveId: string
  receiveIdType?: 'chat_id' | 'open_id' | 'user_id' | 'email'
  msgType: 'text' | 'interactive' | 'post' | 'image'
  content: string | object
}

export async function sendMessage(input: SendMessageInput): Promise<{ message_id: string }> {
  const content = typeof input.content === 'string' ? input.content : JSON.stringify(input.content)
  const data = await larkFetch<{ message_id: string }>('/open-apis/im/v1/messages', {
    method: 'POST',
    query: { receive_id_type: input.receiveIdType ?? 'chat_id' },
    body: JSON.stringify({
      receive_id: input.receiveId,
      msg_type: input.msgType,
      content,
    }),
  })
  return data
}

export async function replyMessage(
  messageId: string,
  msgType: 'text' | 'interactive',
  content: string | object,
  replyInThread = true
): Promise<{ message_id: string }> {
  const body = typeof content === 'string' ? content : JSON.stringify(content)
  const data = await larkFetch<{ message_id: string }>(
    `/open-apis/im/v1/messages/${messageId}/reply`,
    {
      method: 'POST',
      body: JSON.stringify({ msg_type: msgType, content: body, reply_in_thread: replyInThread }),
    }
  )
  return data
}

// ─── card update (delay update via patch) ────────────────────────────────

export async function patchCard(messageId: string, cardContent: object): Promise<void> {
  await larkFetch(`/open-apis/im/v1/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content: JSON.stringify(cardContent) }),
  })
}
