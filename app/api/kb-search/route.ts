import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeContext } from '@/lib/knowledge/search'
import { classifyIntent } from '@/lib/agents'
import type { Intent } from '@/lib/agents'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { query, intent } = await req.json() as { query: string; intent?: string }
  const effectiveIntent = (intent as Intent | undefined) ?? classifyIntent(query)
  const chunks = await getKnowledgeContext(query, effectiveIntent, 5)
  return NextResponse.json({
    results: chunks.map(c => ({ title: c.title, content: c.content })),
  })
}
