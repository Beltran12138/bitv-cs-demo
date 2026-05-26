// Relay user messages to Lark thread after status=human.
// ChatWidget calls this when user sends a message while session.status === 'human'.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { replyMessage, sendMessage } from '@/lib/lark/client'
import { updateCustomerRecord } from '@/lib/lark/base'

export async function POST(req: NextRequest) {
  const { sessionId, message } = await req.json() as {
    sessionId: string
    message: string
  }

  if (!sessionId || !message?.trim()) {
    return NextResponse.json({ error: 'sessionId + message required' }, { status: 400 })
  }

  const larkConfigured = !!(process.env.LARK_APP_ID && process.env.LARK_CS_CHAT_ID)
  if (!larkConfigured) {
    return NextResponse.json({ ok: false, error: 'lark not configured' }, { status: 200 })
  }

  const sb = getSupabase()
  const { data: sess } = await sb
    .from('sessions')
    .select('lark_thread_root_msg_id, lark_base_record_id, status')
    .eq('id', sessionId)
    .maybeSingle()

  if (!sess) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }

  // Format as text — prefix with 用户 marker so agents see source clearly
  const textBody = JSON.stringify({ text: `👤 用户: ${message}` })

  try {
    if (sess.lark_thread_root_msg_id) {
      await replyMessage(sess.lark_thread_root_msg_id, 'text', textBody, true)
    } else {
      // fallback: send fresh to CS group (uncommon — handoff would normally have created root)
      const chatId = process.env.LARK_CS_CHAT_ID!
      await sendMessage({
        receiveId: chatId,
        receiveIdType: 'chat_id',
        msgType: 'text',
        content: textBody,
      })
    }

    // non-critical: update base last_msg_at
    if (sess.lark_base_record_id) {
      updateCustomerRecord(sess.lark_base_record_id, {
        last_msg_at: Date.now(),
      }).catch((e) => console.warn('[base] update fail:', e))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[user-relay] fail:', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
