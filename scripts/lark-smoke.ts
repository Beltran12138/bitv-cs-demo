// Smoke test: verify Lark credentials by pushing a test card to CS group.
// Run: npx tsx scripts/lark-smoke.ts
// Requires .env.local with LARK_APP_ID/APP_SECRET/CS_CHAT_ID/BASE_APP_TOKEN/BASE_TABLE_ID

import { config } from 'dotenv'
config({ path: '.env.local' })

import { sendMessage } from '../lib/lark/client'
import { buildHandoffCard } from '../lib/lark/cards'
import { createCustomerRecord, findRecordBySessionId, updateCustomerRecord } from '../lib/lark/base'

async function main() {
  const required = ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_CS_CHAT_ID', 'LARK_BASE_APP_TOKEN', 'LARK_BASE_TABLE_ID']
  for (const k of required) {
    if (!process.env[k]) {
      console.error(`❌ missing ${k} in .env.local`)
      process.exit(1)
    }
  }

  const sessionId = `smoke-${Date.now()}`

  console.log('1️⃣  推送测试卡片到客服群...')
  const card = buildHandoffCard({
    sessionId,
    userMessage: '【smoke test】我的 KYC 一直卡在 L2，提交了 3 天了还在审核，能帮我看看吗？',
    intent: 'kyc',
    language: 'zh-CN',
  })
  const sent = await sendMessage({
    receiveId: process.env.LARK_CS_CHAT_ID!,
    receiveIdType: 'chat_id',
    msgType: 'interactive',
    content: card,
  })
  console.log(`   ✅ 卡片已发，message_id=${sent.message_id}`)

  console.log('2️⃣  在 lark-base 创建客户档案...')
  const rec = await createCustomerRecord({
    session_id: sessionId,
    user_anon: `smoke-test`,
    intent: 'kyc',
    status: 'waiting',
    start_at: Date.now(),
    last_msg_at: Date.now(),
    messages_count: 1,
    notes: 'smoke test record',
  })
  console.log(`   ✅ 档案已建，record_id=${rec.record_id}`)

  console.log('3️⃣  查档...')
  const found = await findRecordBySessionId(sessionId)
  if (!found) throw new Error('找不到刚建的档案')
  console.log(`   ✅ 查档成功: user=${found.fields.user_anon} status=${found.fields.status}`)

  console.log('4️⃣  更新档案状态为 closed...')
  await updateCustomerRecord(rec.record_id, { status: 'closed', notes: 'smoke test done' })
  console.log(`   ✅ 已关单`)

  console.log('\n🎉 全部通过！请检查飞书客服群中是否收到卡片，base 中是否多了一行 smoke-test 记录。')
}

main().catch((e) => {
  console.error('❌ 失败:', e)
  process.exit(1)
})
