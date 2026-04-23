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

// Rewrites the user query into retrieval-optimised form using DeepSeek.
// Falls back to original query on any error.
async function rewriteQuery(query: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return query
  try {
    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })
    const res = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the following user query for semantic search in a crypto exchange FAQ. Make it specific and include relevant technical terms. Output only the rewritten query, nothing else.',
        },
        { role: 'user', content: query },
      ],
      max_tokens: 80,
      temperature: 0,
    })
    return res.choices[0]?.message?.content?.trim() || query
  } catch {
    return query
  }
}

async function vectorSearch(
  query: string,
  intent: Intent,
  topK: number,
  apiKey: string,
): Promise<KnowledgeChunk[]> {
  try {
    const rewritten = await rewriteQuery(query)
    const openai = new OpenAI({ apiKey })
    const { data } = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: rewritten,
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
  const primary = FAQ_DOCS.filter(d => d.intent === intent)
  if (primary.length === 0) return []
  const slice = primary.slice(0, topK)
  if (slice.length >= topK) return slice.map(d => ({ title: d.title, content: d.content }))

  // fill remaining slots with cross-referenced pages
  const relatedIds = new Set(slice.flatMap(d => d.related))
  const extra = FAQ_DOCS
    .filter(d => relatedIds.has(d.id) && d.intent !== intent)
    .slice(0, topK - slice.length)
  return [...slice, ...extra].map(d => ({ title: d.title, content: d.content }))
}

// Formats chunks into a compact context block for injection into system prompt.
export function formatContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return ''
  const lines = chunks.map(c => `【${c.title}】\n${c.content}`)
  return `\n\nRelevant knowledge base context (use this to answer accurately):\n${lines.join('\n\n')}`
}
