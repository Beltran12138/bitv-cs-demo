// Reproduce pushLarkHandoff against a real session
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { sendMessage } from '../lib/lark/client'
import { buildHandoffCard } from '../lib/lark/cards'
import { createCustomerRecord, findRecordBySessionId, updateCustomerRecord } from '../lib/lark/base'

const SID = process.argv[2] ?? '046be657'

async function main() {
  const supaUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^"|"$/g, '')
  const supaKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/^"|"$/g, '')
  console.log('DEBUG supaUrl=', JSON.stringify(supaUrl), 'len=', supaUrl.length)
  console.log('DEBUG supaKey first=', JSON.stringify(supaKey.slice(0, 20)))
  const sb = createClient(supaUrl, supaKey)
  const chatId = process.env.LARK_CS_CHAT_ID!

  console.log('1. fetch session')
  const { data: sess, error: sErr } = await sb
    .from('sessions')
    .select('intent, lark_base_record_id, lark_thread_root_msg_id, language')
    .eq('id', SID)
    .maybeSingle()
  if (sErr) throw new Error(`session fetch: ${sErr.message}`)
  if (!sess) throw new Error('session not found')
  console.log('   ok', sess)

  const intent = sess.intent ?? 'human'
  const message = '人工'
  let displayMessage = '（测试）KYC L2 审核 3 天未处理'

  console.log('2. build card')
  const card = buildHandoffCard({ sessionId: SID, userMessage: displayMessage, intent, language: sess.language as 'zh-CN' })

  console.log('3. send card to CS group')
  const sent = await sendMessage({
    receiveId: chatId,
    receiveIdType: 'chat_id',
    msgType: 'interactive',
    content: card,
  })
  console.log('   ✅ message_id=', sent.message_id)

  console.log('4. find / create base record')
  let recordId = sess.lark_base_record_id ?? null
  if (!recordId) {
    const existing = await findRecordBySessionId(SID).catch((e) => { console.log('   findBy err:', e.message); return null })
    if (existing) {
      recordId = existing.record_id
      console.log('   found existing:', recordId)
    } else {
      console.log('   creating new...')
      const created = await createCustomerRecord({
        session_id: SID,
        user_anon: `用户-${SID.slice(0, 6)}`,
        intent,
        status: 'waiting',
        start_at: Date.now(),
        last_msg_at: Date.now(),
        messages_count: 1,
        notes: `repro test`,
      })
      recordId = created.record_id
      console.log('   ✅ created:', recordId)
    }
  } else {
    console.log('   updating existing:', recordId)
    await updateCustomerRecord(recordId, { intent, status: 'waiting', last_msg_at: Date.now() })
  }

  console.log('5. update sessions')
  const { error: uErr } = await sb.from('sessions').update({
    status: 'waiting',
    lark_thread_root_msg_id: sent.message_id,
    lark_base_record_id: recordId,
  }).eq('id', SID)
  if (uErr) throw new Error(`session update: ${uErr.message}`)

  console.log('\n🎉 全部成功')
}

main().catch((e) => { console.error('❌ FAIL at:', e); process.exit(1) })
