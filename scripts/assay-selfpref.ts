#!/usr/bin/env tsx
/**
 * Self-preference — a full generator × judge matrix.
 *
 *   npm run selfpref            # grade frozen answers with every judge
 *   npm run selfpref -- --regen # regenerate every generator's answers first
 *
 * ─── Why a matrix, and not "self judge vs cross judge" ──────────────────────
 *
 * The obvious experiment — have the generator's own family grade its answers,
 * then have other families grade the same answers, and call the difference
 * self-preference — was run first here. It produced +0.177, comfortably inside
 * the range the literature reports. It is not usable, because in that design
 * "same family" was perfectly collinear with two other things:
 *
 *   · the self judge was the only non-reasoning model, and
 *   · a judge that is simply lenient toward ALL text scores its own text high
 *     without preferring it at all.
 *
 * Neither can be separated from self-preference with one generator. A matrix
 * can: every model both writes and grades, so each score decomposes into
 *
 *     score(judge j, generator g) ≈ leniency(j) + quality(g) + residual
 *
 * Leniency is estimated from j's off-diagonal row, quality from g's
 * off-diagonal column, and the *additive expectation* for a diagonal cell is
 *
 *     E[S(m,m)] = rowMeanOff(m) + colMeanOff(m) − globalOffDiagonalMean
 *
 * Self-preference is the diagonal's excess over that expectation. A uniformly
 * generous judge has a large diagonal and a residual near zero.
 *
 * ─── Answers are frozen ─────────────────────────────────────────────────────
 *
 * Each generator writes its answers once, to disk. Every judge then grades that
 * identical set. Regenerating per judge would mix judge disagreement with
 * generator nondeterminism (temperature 0.3) and leave no way to tell them
 * apart.
 */

import { config as loadEnv } from 'dotenv'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import OpenAI from 'openai'

loadEnv({ path: '.env.local' })
loadEnv()

import { classifyIntent } from '../lib/agents/index'
import { getKnowledgeContext, formatContext } from '../lib/knowledge/search'
import { SYSTEM_PROMPTS, type AgentPromptKey } from '../lib/prompts/index'
import { GOLDEN_CASES } from '../lib/assay/golden'
import { parseScore, stripReasoning, ScoreParseError } from '../lib/assay/parse'
import { modelFamily } from '../lib/assay/constructs'

const ROUTER_BASE = process.env.ASSAY_JUDGE_BASE_URL
const ROUTER_KEY = process.env.ASSAY_JUDGE_API_KEY

type Model = {
  id: string
  baseURL: string
  apiKey: string | undefined
  /** Reasoning models need room to think before either answer or verdict. */
  maxTokens: number
}

const MODELS: Model[] = [
  { id: 'deepseek-chat',           baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, maxTokens: 400 },
  { id: 'moonshotai/Kimi-K2.6',    baseURL: ROUTER_BASE!,               apiKey: ROUTER_KEY,                   maxTokens: 1600 },
  { id: 'MiniMaxAI/MiniMax-M2.7',  baseURL: ROUTER_BASE!,               apiKey: ROUTER_KEY,                   maxTokens: 1600 },
]

const slug = (id: string) => id.replace(/[^a-zA-Z0-9.-]/g, '_')
const answersPath = (id: string) => `fixtures/answers/${slug(id)}.json`

type FrozenAnswer = { query: string; intent: string; context: string; answer: string }

async function generateAnswers(m: Model): Promise<FrozenAnswer[]> {
  const client = new OpenAI({ apiKey: m.apiKey, baseURL: m.baseURL })
  const out: FrozenAnswer[] = []
  for (const c of GOLDEN_CASES) {
    const intent = classifyIntent(c.query)
    const context = formatContext(await getKnowledgeContext(c.query, intent))
    const promptKey = (intent in SYSTEM_PROMPTS ? intent : 'default') as AgentPromptKey
    const res = await client.chat.completions.create({
      model: m.id,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPTS[promptKey]}${context}\n\n请用简体中文回答。` },
        { role: 'user', content: c.query },
      ],
      max_tokens: m.maxTokens,
      temperature: 0.3,
    })
    // Strip the scratchpad: grading a reasoning trace is not grading an answer.
    const answer = stripReasoning(res.choices[0]?.message?.content ?? '').trim()
    out.push({ query: c.query, intent, context, answer })
    process.stdout.write(answer ? '.' : 'x')
  }
  process.stdout.write('\n')
  return out
}

const BASE_JUDGE_SYSTEM =
  'You grade whether an answer stays inside its source context. ' +
  'You are NOT judging whether the answer is true — only whether every claim it makes ' +
  'is supported by the context given. Reply with ONLY a decimal number between 0 and 1.'

// The baseline prompt leaves one thing undefined: what to do when an answer
// elaborates on the context without contradicting it — rendering "低杠杆" as
// "2-5 倍", say. On that exact case the three judges returned 0.00 / 0.95 /
// 1.00, which is a disagreement about the rubric, not about the text.
//
// `--policy` states the rule explicitly. If the split collapses, the variance
// was in the prompt; if it survives, it is in the models.
const EXTRAPOLATION_POLICY =
  '\n\nRule for elaboration: an answer may restate context facts in different words, ' +
  'and may add a concrete example that is consistent with the context (e.g. context ' +
  'says "low leverage", answer says "2-5x"). That is NOT unsupported — do not deduct ' +
  'for it. Deduct ONLY for claims that contradict the context or introduce facts the ' +
  'context does not cover at all.'

const usePolicy = process.argv.includes('--policy')
const JUDGE_SYSTEM = usePolicy ? BASE_JUDGE_SYSTEM + EXTRAPOLATION_POLICY : BASE_JUDGE_SYSTEM

async function grade(judge: Model, answers: FrozenAnswer[]): Promise<(number | null)[]> {
  const client = new OpenAI({ apiKey: judge.apiKey, baseURL: judge.baseURL })
  const scores: (number | null)[] = []
  for (const a of answers) {
    if (!a.answer) { scores.push(null); process.stdout.write('x'); continue }
    try {
      const res = await client.chat.completions.create({
        model: judge.id,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM },
          {
            role: 'user',
            content: `Context:\n${a.context}\n\nAnswer:\n${a.answer}\n\n` +
              `0.0 = contains claims absent from the context / 1.0 = every claim is supported.`,
          },
        ],
        max_tokens: judge.maxTokens,
        temperature: 0,
      })
      scores.push(parseScore(res.choices[0]?.message?.content ?? ''))
      process.stdout.write('.')
    } catch (e) {
      scores.push(null) // unreadable ≠ zero
      process.stdout.write(e instanceof ScoreParseError ? '?' : '!')
    }
  }
  process.stdout.write('\n')
  return scores
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

async function main() {
  if (!ROUTER_BASE || !ROUTER_KEY) {
    console.error('ASSAY_JUDGE_BASE_URL and ASSAY_JUDGE_API_KEY are required.')
    process.exit(1)
  }
  const regen = process.argv.includes('--regen')

  // ── generate ──────────────────────────────────────────────────────────────
  const answersByModel = new Map<string, FrozenAnswer[]>()
  for (const m of MODELS) {
    const path = answersPath(m.id)
    if (regen || !existsSync(path)) {
      process.stdout.write(`  generating  ${m.id.padEnd(26)} `)
      const a = await generateAnswers(m)
      mkdirSync('fixtures/answers', { recursive: true })
      writeFileSync(path, JSON.stringify({ model: m.id, answers: a }, null, 2) + '\n')
      answersByModel.set(m.id, a)
    } else {
      answersByModel.set(m.id, JSON.parse(readFileSync(path, 'utf8')).answers)
      console.log(`  frozen      ${m.id.padEnd(26)} ${answersPath(m.id)}`)
    }
  }
  console.log()

  // ── grade every generator with every judge ────────────────────────────────
  const S = new Map<string, Map<string, (number | null)[]>>()
  for (const j of MODELS) {
    S.set(j.id, new Map())
    for (const g of MODELS) {
      process.stdout.write(`  ${j.id.split('/').pop()!.padEnd(16)} grades ${g.id.split('/').pop()!.padEnd(16)} `)
      S.get(j.id)!.set(g.id, await grade(j, answersByModel.get(g.id)!))
    }
  }

  // Compare only on rows every (judge, generator) pair could score, so no mean
  // is taken over a different subset of questions than another.
  const nCases = GOLDEN_CASES.length
  const usable: boolean[] = []
  for (let i = 0; i < nCases; i++) {
    usable.push(MODELS.every(j => MODELS.every(g => S.get(j.id)!.get(g.id)![i] !== null)))
  }
  const nUsable = usable.filter(Boolean).length

  const cell = (j: string, g: string) =>
    mean(S.get(j)!.get(g)!.filter((s, i) => usable[i] && s !== null) as number[])

  // ── report ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(78))
  console.log(`generator × judge faithfulness matrix    (n = ${nUsable} of ${nCases} cases usable by all)\n`)

  const short = (id: string) => id.split('/').pop()!.slice(0, 14)
  console.log(`${'judge \\ generator'.padEnd(20)}` + MODELS.map(m => short(m.id).padStart(16)).join(''))
  for (const j of MODELS) {
    const row = MODELS.map(g => {
      const v = cell(j.id, g.id)
      const isDiag = modelFamily(j.id) === modelFamily(g.id)
      return `${isDiag ? '*' : ' '}${v.toFixed(3)}`.padStart(16)
    }).join('')
    console.log(`${short(j.id).padEnd(20)}${row}`)
  }
  console.log('\n  * = judge and generator share a family (the diagonal)')

  if (nUsable === 0) {
    console.log('\nNo case was scored by every pair — nothing can be compared. Stop here.')
    return
  }

  // Additive decomposition.
  const offDiag: number[] = []
  for (const j of MODELS) for (const g of MODELS) {
    if (modelFamily(j.id) !== modelFamily(g.id)) offDiag.push(cell(j.id, g.id))
  }
  const globalOff = mean(offDiag)

  console.log('\n' + '─'.repeat(78))
  console.log(`${'model'.padEnd(18)} ${'leniency'.padEnd(10)} ${'quality'.padEnd(10)} ${'expected'.padEnd(10)} ${'actual'.padEnd(10)} self-pref`)
  console.log('─'.repeat(78))

  const residuals: { model: string; residual: number }[] = []
  for (const m of MODELS) {
    const rowOff = mean(MODELS.filter(g => modelFamily(g.id) !== modelFamily(m.id)).map(g => cell(m.id, g.id)))
    const colOff = mean(MODELS.filter(j => modelFamily(j.id) !== modelFamily(m.id)).map(j => cell(j.id, m.id)))
    const expected = rowOff + colOff - globalOff
    const actual = cell(m.id, m.id)
    const residual = actual - expected
    residuals.push({ model: m.id, residual })
    console.log(
      `${short(m.id).padEnd(18)} ${rowOff.toFixed(3).padEnd(10)} ${colOff.toFixed(3).padEnd(10)} ` +
      `${expected.toFixed(3).padEnd(10)} ${actual.toFixed(3).padEnd(10)} ${residual >= 0 ? '+' : ''}${residual.toFixed(3)}`,
    )
  }
  console.log('─'.repeat(78))
  console.log('leniency = mean score this model GIVES to others')
  console.log('quality  = mean score this model RECEIVES from others')
  console.log('self-pref = actual − (leniency + quality − global off-diagonal mean)')

  // Persist every cell. An aggregate that cannot be traced back to the rows it
  // came from is not evidence — the most interesting number in this table is a
  // large negative residual, and nobody should have to take it on trust.
  const runPath = `fixtures/runs/selfpref-matrix${usePolicy ? '-policy' : ''}.json`
  mkdirSync('fixtures/runs', { recursive: true })
  writeFileSync(runPath, JSON.stringify({
    judgePrompt: usePolicy ? 'base + extrapolation policy' : 'base',
    models: MODELS.map(m => m.id),
    queries: GOLDEN_CASES.map(c => c.query),
    usable,
    scores: Object.fromEntries(
      MODELS.map(j => [j.id, Object.fromEntries(MODELS.map(g => [g.id, S.get(j.id)!.get(g.id)!]))]),
    ),
  }, null, 2) + '\n')
  console.log(`\nper-case scores written to ${runPath}`)

  const meanResidual = mean(residuals.map(r => r.residual))
  console.log(`\nmean self-preference residual: ${meanResidual >= 0 ? '+' : ''}${meanResidual.toFixed(3)}`)
  console.log()
  console.log(`n = ${nUsable} questions, 3 models, one corpus, one judging prompt. The additive`)
  console.log(`model assumes leniency and quality do not interact; with a 3×3 design there is`)
  console.log(`no way to test that assumption. Treat the residuals as a direction, not a`)
  console.log(`magnitude, and do not quote them as a measurement of self-preference at large.`)
  console.log('═'.repeat(78))
}

main().catch(err => { console.error(err); process.exit(1) })
