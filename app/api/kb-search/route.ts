import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeContext } from '@/lib/knowledge/search'
import { FAQ_DOCS } from '@/lib/knowledge/faq'
import { classifyIntent } from '@/lib/agents'
import type { Intent } from '@/lib/agents'

export const dynamic = 'force-dynamic'

const POPULAR_IDS = ['withdraw-steps', 'kyc-materials', 'account-frozen', 'security-tips', 'fee-spot', 'deposit-how']

export async function POST(req: NextRequest) {
  const { query, intent } = await req.json() as { query: string; intent?: string }

  // 1. Try passed intent
  const passedIntent = (intent && intent !== 'unknown') ? intent as Intent : null
  if (passedIntent) {
    const chunks = await getKnowledgeContext(query || passedIntent, passedIntent, 5)
    if (chunks.length > 0) {
      return NextResponse.json({ results: chunks.map(c => ({ title: c.title, content: c.content })) })
    }
  }

  // 2. Try to classify from query text
  if (query?.trim()) {
    const queryIntent = classifyIntent(query)
    if (queryIntent !== 'unknown' && queryIntent !== 'human' && queryIntent !== 'safety' && queryIntent !== 'no_reply') {
      const chunks = await getKnowledgeContext(query, queryIntent, 5)
      if (chunks.length > 0) {
        return NextResponse.json({ results: chunks.map(c => ({ title: c.title, content: c.content })) })
      }
    }
  }

  // 3. Fallback: return popular articles
  const popular = FAQ_DOCS.filter(d => POPULAR_IDS.includes(d.id))
  return NextResponse.json({ results: popular.map(d => ({ title: d.title, content: d.content })), isPopular: true })
}
