// Inspect session state after handoff trigger
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const SID = process.argv[2]
if (!SID) { console.error('usage: tsx scripts/debug-session.ts <session_id>'); process.exit(1) }

async function main() {
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^"|"$/g, ''),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/^"|"$/g, '')
  )
  const { data: session, error } = await sb.from('sessions').select('*').eq('id', SID).maybeSingle()
  if (error) throw error
  console.log('SESSION:', JSON.stringify(session, null, 2))

  const { data: msgs } = await sb.from('messages').select('role,content,created_at').eq('session_id', SID).order('created_at')
  console.log(`\nMESSAGES (${msgs?.length ?? 0}):`)
  for (const m of msgs ?? []) console.log(`  [${m.role}] ${m.content.slice(0, 80)}`)
}

main().catch((e) => { console.error('❌', e); process.exit(1) })
