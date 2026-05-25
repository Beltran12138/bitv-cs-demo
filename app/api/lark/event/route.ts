// Lark event subscription webhook
// Handles: url_verification (handshake), card.action.trigger (button clicks), im.message.receive_v1 (@bot replies)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  decryptIfNeeded,
  verifyToken,
  verifySignature,
} from '@/lib/lark/verify'
import {
  buildHandoffCard,
  buildReplyFormCard,
  buildStatusCard,
  buildLookupCard,
} from '@/lib/lark/cards'
import { findRecordBySessionId, updateCustomerRecord } from '@/lib/lark/base'
import { getCachedName, preWarmName } from '@/lib/lark/users'

type CardActionEvent = {
  schema: '2.0'
  header: { event_id: string; event_type: 'card.action.trigger'; token: string; app_id: string }
  event: {
    operator: { open_id: string; user_id?: string; union_id?: string }
    token: string
    action: {
      tag: string
      value: Record<string, unknown>
      form_value?: Record<string, string>
      input_value?: string
    }
    context: { open_chat_id: string; open_message_id: string }
  }
}

type ImReceiveEvent = {
  schema: '2.0'
  header: { event_id: string; event_type: 'im.message.receive_v1'; token: string }
  event: {
    sender: { sender_id: { open_id: string; user_id?: string }; sender_type: string }
    message: {
      message_id: string
      root_id?: string
      parent_id?: string
      chat_id: string
      message_type: string
      content: string
      mentions?: Array<{ key: string; id: { open_id: string } }>
    }
  }
}

type UrlVerification = { challenge: string; token: string; type: 'url_verification' }

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // 1. signature verify (only when ENCRYPT_KEY is set)
  const sigOk = verifySignature(
    request.headers.get('X-Lark-Request-Timestamp'),
    request.headers.get('X-Lark-Request-Nonce'),
    request.headers.get('X-Lark-Signature'),
    rawBody
  )
  if (!sigOk) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // 2. decrypt if needed
  let bodyStr: string
  try { bodyStr = decryptIfNeeded(rawBody) }
  catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  let body: unknown
  try { body = JSON.parse(bodyStr) }
  catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // 3. URL verification handshake (no token check yet — first-time setup)
  if (isUrlVerification(body)) {
    return NextResponse.json({ challenge: body.challenge })
  }

  // 4. verification token check
  if (!verifyToken(body)) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  // 5. dispatch by event_type
  const ev = body as { header?: { event_type?: string } }
  const eventType = ev.header?.event_type

  try {
    if (eventType === 'card.action.trigger') {
      return await handleCardAction(body as CardActionEvent)
    }
    if (eventType === 'im.message.receive_v1') {
      return await handleImReceive(body as ImReceiveEvent)
    }
  } catch (e) {
    console.error('[lark/event] handler error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // unknown event — ack to stop retries
  return NextResponse.json({ ok: true })
}

// ─── handlers ──────────────────────────────────────────────────────────────

async function handleCardAction(ev: CardActionEvent): Promise<NextResponse> {
  const { action, operator } = ev.event
  const value = action.value as {
    action: string
    sessionId: string
    userMessage?: string
    intent?: string
  }

  // Need session context for the card; fetch once
  const { data: session } = await sb()
    .from('sessions')
    .select('id, language, intent, lark_base_record_id, lark_thread_root_msg_id')
    .eq('id', value.sessionId)
    .maybeSingle()

  const intent = value.intent ?? session?.intent ?? 'unknown'
  // We don't always have user_message in value; look up last user message
  const userMessage = value.userMessage ?? (await fetchLastUserMessage(value.sessionId)) ?? '(用户消息未找到)'

  switch (value.action) {
    case 'open_reply': {
      const card = buildReplyFormCard({ sessionId: value.sessionId, userMessage, intent })
      return cardUpdate(card, '请输入回复内容')
    }

    case 'cancel_reply':
    case 'back_to_handoff': {
      const card = buildHandoffCard({
        sessionId: value.sessionId,
        userMessage,
        intent,
        language: (session?.language ?? 'zh-CN') as 'zh-CN' | 'zh-TW' | 'en',
      })
      return cardUpdate(card)
    }

    case 'send_reply': {
      const replyText = action.form_value?.reply_text?.trim()
      if (!replyText) {
        return NextResponse.json({ toast: { type: 'error', content: '回复内容不能为空' } })
      }

      // CRITICAL: INSERT message (await — needed for Realtime push to ChatWidget)
      const { error } = await sb()
        .from('messages')
        .insert({ session_id: value.sessionId, role: 'agent', content: replyText })
      if (error) throw new Error(`messages insert: ${error.message}`)

      // Non-critical: fire-and-forget to stay under 3s feishu callback timeout
      preWarmName(operator.open_id)
      const agentName = getCachedName(operator.open_id)
      sb().from('sessions').update({ status: 'human' }).eq('id', value.sessionId).then(() => {})
      if (session?.lark_base_record_id) {
        updateCustomerRecord(session.lark_base_record_id, {
          status: 'human',
          agent_user: agentName,
          last_msg_at: Date.now(),
        }).catch((e) => console.warn('[base] update fail:', e))
      }

      const card = buildStatusCard({
        sessionId: value.sessionId,
        userMessage,
        intent,
        status: 'replied',
        agentName,
        lastReply: replyText,
      })
      return cardUpdate(card, '✅ 回复已送达客户')
    }

    case 'accept': {
      preWarmName(operator.open_id)
      const agentName = getCachedName(operator.open_id)
      sb().from('sessions').update({ status: 'human' }).eq('id', value.sessionId).then(() => {})
      if (session?.lark_base_record_id) {
        updateCustomerRecord(session.lark_base_record_id, {
          status: 'human',
          agent_user: agentName,
        }).catch((e) => console.warn('[base] update fail:', e))
      }

      const card = buildStatusCard({
        sessionId: value.sessionId,
        userMessage,
        intent,
        status: 'human',
        agentName,
      })
      return cardUpdate(card, '✋ 已接单')
    }

    case 'lookup': {
      const rec = await findRecordBySessionId(value.sessionId).catch(() => null)
      if (!rec) {
        return NextResponse.json({ toast: { type: 'error', content: '档案不存在' } })
      }
      const card = buildLookupCard({
        sessionId: value.sessionId,
        userMessage,
        intent,
        profile: {
          user_anon: rec.fields.user_anon ?? '匿名',
          intent: rec.fields.intent ?? intent,
          status: rec.fields.status ?? 'waiting',
          start_at: formatTs(rec.fields.start_at),
          last_msg_at: formatTs(rec.fields.last_msg_at),
          agent_user: rec.fields.agent_user,
          messages_count: rec.fields.messages_count ?? 0,
          notes: rec.fields.notes,
        },
      })
      return cardUpdate(card)
    }

    case 'close': {
      preWarmName(operator.open_id)
      const agentName = getCachedName(operator.open_id)
      sb().from('sessions').update({ status: 'closed' }).eq('id', value.sessionId).then(() => {})
      if (session?.lark_base_record_id) {
        updateCustomerRecord(session.lark_base_record_id, {
          status: 'closed',
          agent_user: agentName,
          last_msg_at: Date.now(),
        }).catch((e) => console.warn('[base] update fail:', e))
      }

      const card = buildStatusCard({
        sessionId: value.sessionId,
        userMessage,
        intent,
        status: 'closed',
        agentName,
      })
      return cardUpdate(card, '🔒 已关单')
    }
  }

  return NextResponse.json({ toast: { type: 'error', content: '未知操作' } })
}

async function handleImReceive(ev: ImReceiveEvent): Promise<NextResponse> {
  // Backup path: agent replies in thread by @bot text
  const msg = ev.event.message
  if (msg.message_type !== 'text') {
    return NextResponse.json({ ok: true })
  }

  // Parse content { text: "..." }
  let text: string
  try { text = (JSON.parse(msg.content) as { text: string }).text } catch { return NextResponse.json({ ok: true }) }

  // Strip @mentions
  if (msg.mentions) {
    for (const m of msg.mentions) text = text.replace(m.key, '').trim()
  }
  if (!text) return NextResponse.json({ ok: true })

  // Lookup session by lark_thread_root_msg_id (root_id or parent_id chain)
  const rootId = msg.root_id ?? msg.parent_id
  if (!rootId) return NextResponse.json({ ok: true })

  const { data: session } = await sb()
    .from('sessions')
    .select('id, lark_base_record_id')
    .eq('lark_thread_root_msg_id', rootId)
    .maybeSingle()
  if (!session) return NextResponse.json({ ok: true })

  await sb().from('messages').insert({ session_id: session.id, role: 'agent', content: text })
  await sb().from('sessions').update({ status: 'human' }).eq('id', session.id)
  if (session.lark_base_record_id) {
    preWarmName(ev.event.sender.sender_id.open_id)
    const agentName = getCachedName(ev.event.sender.sender_id.open_id)
    await updateCustomerRecord(session.lark_base_record_id, {
      status: 'human',
      agent_user: agentName,
      last_msg_at: Date.now(),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

// ─── helpers ───────────────────────────────────────────────────────────────

function isUrlVerification(b: unknown): b is UrlVerification {
  return !!b && typeof b === 'object' && (b as { type?: string }).type === 'url_verification'
}

function cardUpdate(card: object, toast?: string): NextResponse {
  const resp: Record<string, unknown> = {
    card: { type: 'raw', data: card },
  }
  if (toast) resp.toast = { type: 'success', content: toast }
  return NextResponse.json(resp)
}

async function fetchLastUserMessage(sessionId: string): Promise<string | null> {
  const { data } = await sb()
    .from('messages')
    .select('content')
    .eq('session_id', sessionId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.content ?? null
}

function formatTs(ts: unknown): string {
  if (typeof ts !== 'number') return '—'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
}
