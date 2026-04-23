import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Langfuse } from 'langfuse'

// POST /api/feedback  { messageId: string, rating: 1 | -1, traceId?: string }
export async function POST(req: NextRequest) {
  const { messageId, rating, traceId } = await req.json() as {
    messageId: string
    rating: 1 | -1
    traceId?: string
  }

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

  if (traceId && process.env.LANGFUSE_SECRET_KEY) {
    const lf = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
      flushAt: 1,
      flushInterval: 0,
    })
    lf.score({ traceId, name: 'user-feedback', value: rating })
    await lf.flushAsync()
  }

  return NextResponse.json({ ok: true })
}
