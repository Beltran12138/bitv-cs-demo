#!/usr/bin/env tsx
/**
 * RAGAS-style RAG eval — faithfulness + answer relevance
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npm run eval
 *
 * Evaluates 10 golden queries:
 *   1. Retrieve context via intentFilter (no API keys needed for retrieval)
 *   2. Generate answer via DeepSeek
 *   3. Score faithfulness + relevance via DeepSeek-as-judge
 */

import OpenAI from 'openai'
import { classifyIntent } from '../lib/agents/index'
import { FAQ_DOCS } from '../lib/knowledge/faq'
import { SYSTEM_PROMPTS } from '../lib/prompts/index'
import type { Intent } from '../lib/agents/index'
import type { AgentPromptKey } from '../lib/prompts/index'

const API_KEY = process.env.DEEPSEEK_API_KEY
if (!API_KEY) {
  console.error('Error: DEEPSEEK_API_KEY is required')
  console.error('Usage: DEEPSEEK_API_KEY=sk-... npm run eval')
  process.exit(1)
}

const client = new OpenAI({ apiKey: API_KEY, baseURL: 'https://api.deepseek.com' })

// Mirrors intentFilter + cross-reference fallback from lib/knowledge/search.ts
function getContext(intent: Intent, topK = 3) {
  const primary = FAQ_DOCS.filter(d => d.intent === intent)
  if (primary.length === 0) return []
  const slice = primary.slice(0, topK)
  if (slice.length >= topK) return slice
  const relatedIds = new Set(slice.flatMap(d => d.related))
  const extra = FAQ_DOCS
    .filter(d => relatedIds.has(d.id) && d.intent !== intent)
    .slice(0, topK - slice.length)
  return [...slice, ...extra]
}

function formatContext(chunks: { title: string; content: string }[]) {
  return chunks.map(c => `【${c.title}】\n${c.content}`).join('\n\n')
}

async function generateAnswer(query: string, intent: Intent, contextText: string): Promise<string> {
  const promptKey = (intent in SYSTEM_PROMPTS ? intent : 'default') as AgentPromptKey
  const systemContent =
    `${SYSTEM_PROMPTS[promptKey]}\n\nRelevant knowledge base context:\n${contextText}\n\n请用简体中文回答。`

  const res = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: query },
    ],
    max_tokens: 200,
    temperature: 0.3,
  })
  return res.choices[0]?.message?.content?.trim() ?? ''
}

async function judgeScore(prompt: string): Promise<number> {
  const res = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: 'You are an impartial evaluator. Reply with ONLY a decimal number between 0 and 1. No other text.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 10,
    temperature: 0,
  })
  const text = res.choices[0]?.message?.content?.trim() ?? '0'
  const n = parseFloat(text)
  return isNaN(n) ? 0 : Math.min(1, Math.max(0, n))
}

function evalFaithfulness(context: string, answer: string): Promise<number> {
  return judgeScore(
    `Context:\n${context}\n\nAnswer:\n${answer}\n\nDoes the answer ONLY use facts from the context above? Does it avoid adding information not present in the context?\n0.0 = completely hallucinated / 1.0 = fully faithful to context.`,
  )
}

function evalAnswerRelevance(query: string, answer: string): Promise<number> {
  return judgeScore(
    `Question: ${query}\n\nAnswer: ${answer}\n\nDoes the answer directly and completely address the question?\n0.0 = completely irrelevant / 1.0 = perfectly answers the question.`,
  )
}

const EVAL_QUERIES = [
  'maker taker费率是多少',
  '合约手续费怎么算',
  '怎么提币，步骤是什么',
  '提币要多久到账',
  'KYC认证需要什么材料',
  '如何充值USDT入金',
  '如何开启2FA保护账户',
  '永续合约最高多少倍杠杆',
  '怎么注册bitV账号',
  'API Key权限有哪些',
]

type EvalResult = {
  query: string
  intent: string
  faithfulness: number
  relevance: number
}

async function main() {
  console.log('bitV RAG Eval — RAGAS-style faithfulness + answer relevance')
  console.log(`Evaluating ${EVAL_QUERIES.length} queries via DeepSeek judge...\n`)

  const results: EvalResult[] = []

  for (const query of EVAL_QUERIES) {
    process.stdout.write(`  ${query.padEnd(28)} `)
    const intent = classifyIntent(query) as Intent
    const chunks = getContext(intent)
    const contextText = formatContext(chunks)

    const answer = await generateAnswer(query, intent, contextText)
    const [faithfulness, relevance] = await Promise.all([
      evalFaithfulness(contextText, answer),
      evalAnswerRelevance(query, answer),
    ])

    results.push({ query, intent, faithfulness, relevance })
    console.log(`intent=${intent.padEnd(8)} faith=${faithfulness.toFixed(2)}  relev=${relevance.toFixed(2)}`)
  }

  const avgF = results.reduce((s, r) => s + r.faithfulness, 0) / results.length
  const avgR = results.reduce((s, r) => s + r.relevance, 0) / results.length

  console.log('\n' + '─'.repeat(60))
  console.log(`${'Query'.padEnd(28)} ${'Intent'.padEnd(10)} Faith  Relev`)
  console.log('─'.repeat(60))
  for (const r of results) {
    console.log(`${r.query.padEnd(28)} ${r.intent.padEnd(10)} ${r.faithfulness.toFixed(2)}    ${r.relevance.toFixed(2)}`)
  }
  console.log('─'.repeat(60))
  console.log(`${'AVERAGE'.padEnd(28)} ${''.padEnd(10)} ${avgF.toFixed(2)}    ${avgR.toFixed(2)}`)
  console.log()

  if (avgF < 0.7) process.stdout.write('WARN faithfulness < 0.70 — review context quality\n')
  if (avgR < 0.7) process.stdout.write('WARN relevance < 0.70 — review system prompts\n')
  if (avgF >= 0.8 && avgR >= 0.8) process.stdout.write('PASS RAG pipeline quality: GOOD\n')
}

main().catch(err => { console.error(err); process.exit(1) })
