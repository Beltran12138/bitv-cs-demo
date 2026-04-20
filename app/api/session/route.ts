import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Language } from '@/lib/i18n'

export async function POST(request: Request) {
  const { language }: { language: Language } = await request.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({ language, status: 'bot' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(session)
}
