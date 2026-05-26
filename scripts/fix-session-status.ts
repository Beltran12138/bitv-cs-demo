import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^"|"$/g, ''),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/^"|"$/g, '')
)
const ID = process.argv[2]
const STATUS = process.argv[3] ?? 'human'

if (!ID) { console.error('usage: tsx fix-session-status.ts <sessionId> [status]'); process.exit(1) }

;(async () => {
  const { data, error } = await sb.from('sessions').update({ status: STATUS }).eq('id', ID).select()
  console.log('error:', error)
  console.log('updated:', data)
})()
