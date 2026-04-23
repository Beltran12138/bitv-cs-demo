import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { FAQ_DOCS } from './faq'
import type { Intent } from '@/lib/agents'

export type KnowledgeChunk = { title: string; content: string }

// Returns top-k relevant FAQ chunks for a given query + intent.
// If OPENAI_API_KEY is set: embed query → pgvector cosine search (production).
// Otherwise: filter FAQ_DOCS by intent (demo fallback).
export async function getKnowledgeContext(
  query: string,
  intent: Intent,
  topK = 3,
): Promise<KnowledgeChunk[]> {
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    return vectorSearch(query, intent, topK, apiKey)
  }

  return intentFilter(intent, topK)
}

async function vectorSearch(
  query: string,
  intent: Intent,
  topK: number,
  apiKey: string,
): Promise<KnowledgeChunk[]> {
  try {
    const openai = new OpenAI({ apiKey })
    const { data } = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    const embedding = data[0].embedding

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const domainIntent = ['fee','withdraw','kyc','deposit','security','futures','register','api'].includes(intent)
      ? intent
      : null

    const { data: chunks } = await supabase.rpc('match_knowledge', {
      query_embedding: embedding,
      match_count: topK,
      filter_intent: domainIntent,
    })

    if (chunks && chunks.length > 0) {
      return (chunks as { title: string; content: string }[]).map(c => ({
        title: c.title,
        content: c.content,
      }))
    }
  } catch {
    // pgvector unavailable or not seeded → fall through to intent filter
  }

  return intentFilter(intent, topK)
}

function intentFilter(intent: Intent, topK: number): KnowledgeChunk[] {
  const filtered = FAQ_DOCS.filter(d => d.intent === intent)
  if (filtered.length === 0) return []
  return filtered.slice(0, topK).map(d => ({ title: d.title, content: d.content }))
}

// Formats chunks into a compact context block for injection into system prompt.
export function formatContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return ''
  const lines = chunks.map(c => `【${c.title}】\n${c.content}`)
  return `\n\nRelevant knowledge base context (use this to answer accurately):\n${lines.join('\n\n')}`
}
