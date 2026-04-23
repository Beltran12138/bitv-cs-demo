import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { FAQ_DOCS } from '@/lib/knowledge/faq'

// POST /api/seed
// Embeds all FAQ docs and upserts into knowledge_chunks.
// Requires OPENAI_API_KEY. Run once to populate the pgvector store.
export async function POST(req: NextRequest) {
  // Simple admin guard — pass ?secret=<SEED_SECRET> or remove for internal use
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (process.env.SEED_SECRET && secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 400 })
  }

  const openai = new OpenAI({ apiKey })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Clear existing chunks before re-seeding
  await supabase.from('knowledge_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const results: { title: string; ok: boolean }[] = []

  for (const doc of FAQ_DOCS) {
    try {
      const { data } = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: `${doc.title}\n${doc.content}`,
      })
      const embedding = data[0].embedding

      const { error } = await supabase.from('knowledge_chunks').insert({
        intent: doc.intent,
        title: doc.title,
        content: doc.content,
        embedding,
      })

      results.push({ title: doc.title, ok: !error })
    } catch {
      results.push({ title: doc.title, ok: false })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  return NextResponse.json({
    total: FAQ_DOCS.length,
    succeeded,
    failed: FAQ_DOCS.length - succeeded,
    results,
  })
}
