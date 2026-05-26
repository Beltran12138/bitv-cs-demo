import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^"|"$/g, ''),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/^"|"$/g, '')
)
const PREFIX = process.argv[2] ?? '0a59de'

;(async () => {
  const { data: sessions } = await sb
    .from('sessions')
    .select('id,status,intent,language,lark_thread_root_msg_id,lark_base_record_id,created_at')
    .order('created_at', { ascending: false })
    .limit(30)
  const match = sessions?.find(s => s.id.startsWith(PREFIX))
  console.log('SESSION MATCH:', match ?? 'NOT FOUND')
  if (!match) {
    console.log('\nLAST 30 SESSIONS:')
    sessions?.forEach(s => console.log(`  ${s.id.slice(0,8)} intent=${s.intent} status=${s.status} larkMsg=${s.lark_thread_root_msg_id?.slice(-8) ?? 'NONE'} larkRec=${s.lark_base_record_id?.slice(-6) ?? 'NONE'} at=${s.created_at}`))
    return
  }
  const { data: msgs } = await sb
    .from('messages')
    .select('role,content,created_at')
    .eq('session_id', match.id)
    .order('created_at', { ascending: true })
  console.log('\nMESSAGES:')
  msgs?.forEach(m => console.log(`  [${m.role}] ${m.content.slice(0,120)}`))
})()
