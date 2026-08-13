#!/usr/bin/env tsx
/**
 * assay — evaluate the reference agent, and report what the scores are worth.
 *
 *   npm run eval
 *
 * Two constructs are measured, on purpose, by two different procedures:
 *
 *   faithfulness         llm_judge      did the answer stay inside the context?
 *   fact_token_presence  deterministic  do the required strings appear?
 *
 * Neither one is `correctness`, and the report will say so. They are never
 * averaged — the interesting case is exactly when they disagree.
 *
 * By default the judge is the same model that generated the answers, which the
 * report flags as CRITICAL. That default is not an oversight; it is the
 * configuration most RAG evals ship with, and running it is the fastest way to
 * see what the check does. To grade across families:
 *
 *   ASSAY_JUDGE_MODEL=gpt-4o ASSAY_JUDGE_API_KEY=sk-... npm run eval
 *   ASSAY_JUDGE_MODEL=glm-4-plus ASSAY_JUDGE_API_KEY=... \
 *     ASSAY_JUDGE_BASE_URL=https://open.bigmodel.cn/api/paas/v4 npm run eval
 */

import { config as loadEnv } from 'dotenv'
import OpenAI from 'openai'

loadEnv({ path: '.env.local' })
loadEnv() // .env, if present — does not override what .env.local already set

import { classifyIntent } from '../lib/agents/index'
import { getKnowledgeContext, formatContext } from '../lib/knowledge/search'
import { SYSTEM_PROMPTS, type AgentPromptKey } from '../lib/prompts/index'
import { GOLDEN_CASES, tokenCoverage } from '../lib/assay/golden'
import { buildReport, formatReport } from '../lib/assay/report'
import { parseScore, ScoreParseError } from '../lib/assay/parse'
import type { Observation } from '../lib/assay/constructs'

const GEN_MODEL = process.env.ASSAY_GEN_MODEL ?? 'deepseek-chat'
const GEN_KEY = process.env.DEEPSEEK_API_KEY
const GEN_BASE_URL = process.env.ASSAY_GEN_BASE_URL ?? 'https://api.deepseek.com'

// Judge defaults to the generator — deliberately, see header.
const JUDGE_MODEL = process.env.ASSAY_JUDGE_MODEL ?? GEN_MODEL
const JUDGE_KEY = process.env.ASSAY_JUDGE_API_KEY ?? GEN_KEY
const JUDGE_BASE_URL = process.env.ASSAY_JUDGE_BASE_URL ?? GEN_BASE_URL
// Reasoning judges emit their scratchpad before the verdict; a tight cap
// truncates the reply before any score appears.
const JUDGE_MAX_TOKENS = Number(process.env.ASSAY_JUDGE_MAX_TOKENS ?? (JUDGE_MODEL === GEN_MODEL ? 16 : 1600))

if (!GEN_KEY) {
  console.error('DEEPSEEK_API_KEY is required (generation model).')
  process.exit(1)
}

const generator = new OpenAI({ apiKey: GEN_KEY, baseURL: GEN_BASE_URL })
const judge = new OpenAI({ apiKey: JUDGE_KEY, baseURL: JUDGE_BASE_URL })

async function generateAnswer(query: string, intent: string, context: string): Promise<string> {
  const promptKey = (intent in SYSTEM_PROMPTS ? intent : 'default') as AgentPromptKey
  const res = await generator.chat.completions.create({
    model: GEN_MODEL,
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPTS[promptKey]}${context}\n\n请用简体中文回答。` },
      { role: 'user', content: query },
    ],
    max_tokens: 300,
    temperature: 0.3,
  })
  return res.choices[0]?.message?.content?.trim() ?? ''
}

async function judgeFaithfulness(context: string, answer: string): Promise<number | null> {
  const res = await judge.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You grade whether an answer stays inside its source context. ' +
          'You are NOT judging whether the answer is true — only whether every claim ' +
          'it makes is supported by the context given. Reply with ONLY a decimal 0 to 1.',
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nAnswer:\n${answer}\n\n0.0 = contains claims absent from the context / 1.0 = every claim is supported.`,
      },
    ],
    max_tokens: JUDGE_MAX_TOKENS,
    temperature: 0,
  })
  try {
    return parseScore(res.choices[0]?.message?.content ?? '')
  } catch (e) {
    // A judge whose reply cannot be read has not scored zero. Returning 0 here
    // would quietly turn "the measurement failed" into "the answer was bad" —
    // see FINDINGS #4 for the version of this bug that nearly produced a
    // fabricated headline result.
    if (e instanceof ScoreParseError) return null
    throw e
  }
}

async function main() {
  console.log('assay — reference agent evaluation')
  console.log(`  generator: ${GEN_MODEL}`)
  console.log(`  judge:     ${JUDGE_MODEL}${JUDGE_MODEL === GEN_MODEL ? '  (same as generator — see report)' : ''}`)
  console.log(`  cases:     ${GOLDEN_CASES.length}\n`)

  const observations: Observation[] = []
  let unreadable = 0

  for (const c of GOLDEN_CASES) {
    process.stdout.write(`  ${c.query.padEnd(30)}`)

    // Production entry point — same call the API route makes.
    const intent = classifyIntent(c.query)
    const chunks = await getKnowledgeContext(c.query, intent)
    const context = formatContext(chunks)

    const answer = await generateAnswer(c.query, intent, context)

    const faithfulness = await judgeFaithfulness(context, answer)
    const tokens = tokenCoverage(answer, c.answerMustContain)

    if (faithfulness !== null) {
      observations.push({
        construct: 'faithfulness',
        method: 'llm_judge',
        score: faithfulness,
        generator: GEN_MODEL,
        judge: JUDGE_MODEL,
        source: `golden:${c.query}`,
      })
    } else {
      unreadable++
    }
    observations.push({
      construct: 'fact_token_presence',
      method: 'deterministic',
      score: tokens,
      generator: GEN_MODEL,
      judge: null,
      source: `golden:${c.query}`,
      note: `surface-form coverage over ${JSON.stringify(c.answerMustContain)}`,
    })

    console.log(` faith ${faithfulness === null ? ' n/a' : faithfulness.toFixed(2)}   tokens ${tokens.toFixed(2)}`)
  }

  console.log('\n' + '─'.repeat(72))
  if (unreadable > 0) {
    console.log(`${unreadable} judge repl${unreadable === 1 ? 'y' : 'ies'} could not be read and were DROPPED, not scored 0.`)
  }
  console.log(formatReport(buildReport(observations)))
  console.log('─'.repeat(72))
}

main().catch(err => { console.error(err); process.exit(1) })
