// Shared handoff logic — used by /api/bot (intent=human) and /api/handoff (manual button)

import { getSupabase } from '@/lib/supabase'
import { sendMessage as larkSend } from '@/lib/lark/client'
import { buildHandoffCard } from '@/lib/lark/cards'
import { createCustomerRecord, updateCustomerRecord, findRecordBySessionId } from '@/lib/lark/base'
import type { Language } from '@/lib/i18n'

const HUMAN_TRIGGERS = /^(人工|转人工|轉人工|客服|真人|human|agent|support|representative)$/i

export async function pushLarkHandoff(
  sessionId: string,
  message: string,
  language: Language
): Promise<{ message_id: string; record_id: string | null }> {
  const supabase = getSupabase()
  const chatId = process.env.LARK_CS_CHAT_ID
  if (!chatId) throw new Error('LARK_CS_CHAT_ID missing')

  let displayMessage = message
  if (HUMAN_TRIGGERS.test(message.trim())) {
    const { data: prev } = await supabase
      .from('messages')
      .select('content,role,created_at')
      .eq('session_id', sessionId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(5)
    if (prev && prev.length > 0) {
      const real = prev.find((m) => !HUMAN_TRIGGERS.test(m.content.trim()))
      displayMessage = real?.content ?? '（客户主动请求转人工，无具体问题描述）'
    } else {
      displayMessage = '（客户主动请求转人工，无具体问题描述）'
    }
  }

  const { data: sess } = await supabase
    .from('sessions')
    .select('intent, lark_base_record_id, lark_thread_root_msg_id')
    .eq('id', sessionId)
    .maybeSingle()
  const intent = sess?.intent ?? 'human'

  const card = buildHandoffCard({ sessionId, userMessage: displayMessage, intent, language })
  const sent = await larkSend({
    receiveId: chatId,
    receiveIdType: 'chat_id',
    msgType: 'interactive',
    content: card,
  })

  let recordId = sess?.lark_base_record_id ?? null
  if (!recordId) {
    const existing = await findRecordBySessionId(sessionId).catch(() => null)
    if (existing) {
      recordId = existing.record_id
      await updateCustomerRecord(recordId, {
        intent,
        status: 'waiting',
        last_msg_at: Date.now(),
      }).catch(() => {})
    } else {
      const created = await createCustomerRecord({
        session_id: sessionId,
        user_anon: `用户-${sessionId.slice(0, 6)}`,
        intent,
        status: 'waiting',
        start_at: Date.now(),
        last_msg_at: Date.now(),
        messages_count: 1,
        notes: `首次转人工: ${displayMessage.slice(0, 100)}`,
      }).catch((e) => { console.warn('[base] create:', e); return null })
      recordId = created?.record_id ?? null
    }
  } else {
    await updateCustomerRecord(recordId, {
      intent,
      status: 'waiting',
      last_msg_at: Date.now(),
    }).catch(() => {})
  }

  await supabase.from('sessions').update({
    status: 'waiting',
    lark_thread_root_msg_id: sent.message_id,
    lark_base_record_id: recordId,
  }).eq('id', sessionId)

  return { message_id: sent.message_id, record_id: recordId }
}
