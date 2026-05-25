// List recent sessions in 'waiting' status
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^"|"$/g, ''),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/^"|"$/g, '')
  )
  const { data } = await sb.from('sessions')
    .select('id,status,intent,lark_thread_root_msg_id,lark_base_record_id,created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('Recent 10 sessions:')
  for (const s of data ?? []) {
    const lark = s.lark_thread_root_msg_id ? '✅' : '❌'
    console.log(`  ${s.created_at.slice(11, 19)} ${s.id} status=${s.status} intent=${s.intent} lark=${lark}`)
  }
}
main().catch(console.error)
