import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/feedback  { messageId: string, rating: 1 | -1 }
export async function POST(req: NextRequest) {
  const { messageId, rating } = await req.json() as { messageId: string; rating: 1 | -1 }

  if (!messageId || (rating !== 1 && rating !== -1)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { error } = await supabase.from('message_feedback').upsert(
    { message_id: messageId, rating },
    { onConflict: 'message_id' },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
