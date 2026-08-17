#!/usr/bin/env tsx
/**
 * Sensitivity control — before trusting any number this harness produces, show
 * that the harness can still detect a failure it is known to contain.
 *
 *   npm run sensitivity
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * Every metric in `assay` reports a number. None of them reports whether it is
 * still able to tell anything apart. Those are different claims, and only the
 * second one can be established without an external ground truth: feed the
 * pipeline inputs whose label you already know, and check that the label comes
 * back out.
 *
 * The pattern is borrowed from a local negotiation-game testbed
 * (`ai-game-bench/test_metrics.py`, not published) where a four-way defection
 * classifier reported `plan_failure = 0%` across 120 games. A synthetic
 * positive control was the only way to distinguish "no execution failures
 * happened" from "this metric is blind to execution failures". It turned out to
 * be the former — but the conclusion was worthless until the control ran.
 *
 * `assay` has the same exposure in two places, and one of them already fired:
 *
 *   · FINDINGS #4 — `parseFloat(" 0 </think> 0.7")` returned 0, which would
 *     have published a ~98-point self-preference effect that does not exist.
 *     Fixed reactively, after the number looked too good.
 *   · The self-preference matrix drops unreadable cells and averages the rest
 *     (n = 10 of 13). Whether those drops are random or systematic was never
 *     checked, and a systematically-dropped subset is not a smaller sample —
 *     it is a different one.
 *
 * ─── Three layers, one exit code ────────────────────────────────────────────
 *
 *   A  parser control    offline, no key    known replies → known scores
 *   B  judge control     online, needs key  known answers → known verdicts
 *   C  drop audit        offline, no key    are the dropped cases a subset or a
 *                                           stratum?
 *
 * Layer A covers the "unreadable output" case: an unparseable reply is a parser
 * event, not a judgement, and asking a live judge to produce one on demand
 * would test nothing. Layer B covers the two cases that need an actual model:
 * a fully supported answer and a known hallucination.
 *
 * Exit codes: 0 pass · 1 a control failed · 2 a control could not run.
 * A control that could not run is not a control that passed.
 *
 * ⚠️ No measured number is hard-coded anywhere below. `decision-confidence`
 * shipped a `LEAKAGE` dict that stated its skew figures as text, kept reporting
 * them after a second source changed them, and the same run printed both. Every
 * figure this script prints is computed from the files present at run time.
 */

import { config as loadEnv } from 'dotenv'
import { readFileSync, readdirSync, existsSync } from 'fs'
import OpenAI from 'openai'

loadEnv({ path: '.env.local' })
loadEnv()

import { parseScore, ScoreParseError } from '../lib/assay/parse'

const failures: string[] = []
const skipped: string[] = []
const rule = (c = '─') => console.log(c.repeat(78))

// ─── Layer A: the parser ─────────────────────────────────────────────────────
//
// Each case is a reply that has actually been observed from one of the three
// judges, or a class of reply that must not be silently coerced into a score.
// `throws` means: this input carries no verdict, and the only correct output is
// a refusal. A parser that guesses here manufactures data.

type ParserCase = { name: string; raw: string; expect: number | 'throws'; why: string }

const PARSER_CASES: ParserCase[] = [
  { name: 'bare score', raw: '0.7', expect: 0.7, why: 'the format the prompt asks for' },
  {
    name: 'leaked reasoning',
    raw: ' 0 </think> 0.7',
    expect: 0.7,
    why: 'observed from Kimi; parseFloat read this as 0 and nearly published a fake effect',
  },
  {
    name: 'verdict restated at the end',
    raw: 'The answer adds 3 facts not in the context, so the rating should be 0.4',
    expect: 0.4,
    why: 'judges ignore "reply with only a number"; the last number is the verdict',
  },
  {
    name: 'truncated mid-reasoning',
    raw: '<think>Let me check each claim. The context mentions 1 hour and 3 steps',
    expect: 'throws',
    why: 'an unclosed <think> was cut off before any verdict; its digits are not a score',
  },
  { name: 'refusal', raw: 'I cannot grade this answer.', expect: 'throws', why: 'no number at all' },
  {
    name: 'out of range',
    raw: 'I would give it 85 out of 100',
    expect: 'throws',
    why: 'a 0..1 contract silently reinterpreted as a percentage is a scale error, not a score',
  },
]

function layerA(): void {
  console.log('\nA · parser control                                    offline, no key needed')
  rule()
  for (const c of PARSER_CASES) {
    let got: number | string
    try {
      got = parseScore(c.raw)
    } catch (e) {
      got = e instanceof ScoreParseError ? 'throws' : 'threw the wrong error'
    }
    const ok = got === c.expect
    if (!ok) failures.push(`A/${c.name}: expected ${c.expect}, got ${got}`)
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(28)} → ${String(got).padEnd(8)} ${c.why}`)
  }
}

// ─── Layer B: the judge ──────────────────────────────────────────────────────
//
// One context, three answers with known labels. The context is a real fixture
// (`fixtures/answers/*.json`, the USDT deposit case) rather than something
// written for this test, because a judge that only works on prose written by
// the person testing it has not been tested.
//
// Two of the three are hallucinations, and the difference between them is the
// point of this layer:
//
//   · `distilled` — the invented claims, concentrated, with the supported
//     material stripped out. This is what a positive control usually looks
//     like, and it is the easy case.
//   · `wild` — the answer deepseek-chat actually produced, verbatim from the
//     frozen fixture. The same invented claims sit inside four paragraphs of
//     correctly grounded text.
//
// A control built only from the distilled version measures whether the judge
// can see a hallucination at all. It says nothing about whether the judge sees
// one at the density that occurs in practice — and the two answers do not get
// the same verdict. Keeping both is the whole reason this layer is worth
// running: the same failure mode killed a conclusion in `ai-game-bench`, where
// `wait` was made a strictly dominated action, so "no idle-drift observed" was
// a weak test rather than a finding.
//
// The label is not asserted, it is checked: `LABEL_EVIDENCE` lists strings the
// answers claim and the context must not contain. If the corpus ever changes so
// that one of them is supported, the control retires itself instead of quietly
// grading against a stale label.

const DEPOSIT_CONTEXT_QUERY = '如何充值USDT入金'

/**
 * Claims present in both hallucinated answers that the context must not support.
 *
 * The invented UI path (进入「资产」或「钱包」页面) is deliberately *not* on this
 * list, even though it is the most clearly fabricated thing in the answer: the
 * context does contain 钱包, in 从外部钱包转入 — a different referent for the same
 * token. Substring matching cannot separate the two, so it would report the
 * label as invalid for the wrong reason. Only claims whose strings are absent
 * outright are used as evidence.
 */
const LABEL_EVIDENCE = ['TRC20', 'ERC20', 'BEP20', 'CNY', '最低充值金额']

function loadFixtureCase(): { context: string; wildAnswer: string } | null {
  const path = 'fixtures/answers/deepseek-chat.json'
  if (!existsSync(path)) return null
  const answers = JSON.parse(readFileSync(path, 'utf8')).answers as {
    query: string
    context: string
    answer: string
  }[]
  const hit = answers.find(a => a.query === DEPOSIT_CONTEXT_QUERY)
  return hit ? { context: hit.context, wildAnswer: hit.answer } : null
}

const SUPPORTED_ANSWER = `充值有两种方式：①加密货币充值，在平台获取充值地址后从外部钱包转入对应网络的资产；②法币入金，通过合作支付渠道购买稳定币。
选择正确的网络非常重要，错误网络会导致资产丢失。
如果充值后 1 小时仍未到账，请先确认发送网络与选择的网络一致，再用区块链浏览器查询 TxID 确认链上状态；若链上已确认仍未显示，请提交含 TxID 的工单。`

const HALLUCINATED_ANSWER = `在Acme平台充值USDT：
1. 登录Acme账户，进入"资产"或"钱包"页面，选择USDT，点击"充值"。
2. 选择网络：请务必选择与您转出平台完全一致的网络（例如TRC20、ERC20、BEP20等）。
3. 复制系统生成的USDT充值地址，从外部钱包转入。
法币入金：选择"买币"入口，选择法币（如CNY）和金额，通过合作的第三方支付渠道完成购买。
关于最低充值金额：不同网络和充值方式的最低限额不同，页面会明确显示。`

const JUDGE_SYSTEM =
  'You grade whether an answer stays inside its source context. ' +
  'You are NOT judging whether the answer is true — only whether every claim it makes ' +
  'is supported by the context given. Reply with ONLY a decimal number between 0 and 1.'

// Thresholds are properties of the control, not measurements: a judge that
// cannot clear this bar cannot support any faithfulness claim, whatever its
// average happens to be.
const SUPPORTED_FLOOR = 0.8
const HALLUCINATED_CEILING = 0.5
const MIN_DISCRIMINATION = 0.3

const ROUTER_BASE = process.env.ASSAY_JUDGE_BASE_URL
const ROUTER_KEY = process.env.ASSAY_JUDGE_API_KEY

const JUDGES = [
  { id: 'deepseek-chat', baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, maxTokens: 400 },
  { id: 'moonshotai/Kimi-K2.6', baseURL: ROUTER_BASE, apiKey: ROUTER_KEY, maxTokens: 1600 },
  { id: 'MiniMaxAI/MiniMax-M2.7', baseURL: ROUTER_BASE, apiKey: ROUTER_KEY, maxTokens: 1600 },
]

async function scoreOne(
  judge: (typeof JUDGES)[number],
  context: string,
  answer: string,
): Promise<number | null> {
  const client = new OpenAI({ apiKey: judge.apiKey, baseURL: judge.baseURL })
  try {
    const res = await client.chat.completions.create({
      model: judge.id,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        {
          role: 'user',
          content: `Context:\n${context}\n\nAnswer:\n${answer}\n\n` +
            `0.0 = contains claims absent from the context / 1.0 = every claim is supported.`,
        },
      ],
      max_tokens: judge.maxTokens,
      temperature: 0,
    })
    return parseScore(res.choices[0]?.message?.content ?? '')
  } catch {
    return null
  }
}

async function layerB(): Promise<void> {
  console.log('\nB · judge control                                        online, needs API keys')
  rule()

  const fixture = loadFixtureCase()
  if (!fixture) {
    skipped.push('B: fixtures/answers/deepseek-chat.json missing — run `npm run selfpref` first')
    console.log('  SKIP  no frozen fixture to take a context from')
    return
  }
  const { context, wildAnswer } = fixture

  // Verify the labels before grading against them.
  const supportedAfterAll = LABEL_EVIDENCE.filter(t => context.includes(t))
  if (supportedAfterAll.length) {
    skipped.push(
      `B: the context now contains ${supportedAfterAll.join(', ')} — the "hallucinated" label no longer holds. ` +
        `Pick a new control case rather than grading against a stale label.`,
    )
    console.log(`  SKIP  label invalidated by corpus change: ${supportedAfterAll.join(', ')}`)
    return
  }
  const missingFromWild = LABEL_EVIDENCE.filter(t => !wildAnswer.includes(t))
  if (missingFromWild.length > LABEL_EVIDENCE.length / 2) {
    skipped.push(
      `B: the frozen answer no longer makes most of the unsupported claims (missing ${missingFromWild.join(', ')}) — ` +
        `regenerate the control, it is grading a different answer than the one it was built for.`,
    )
    console.log(`  SKIP  frozen answer changed: ${missingFromWild.join(', ')} absent`)
    return
  }

  const usable = JUDGES.filter(j => j.apiKey && j.baseURL)
  if (usable.length === 0) {
    skipped.push('B: no API keys in .env.local — the judge control did not run')
    console.log('  SKIP  no API keys configured')
    return
  }
  if (usable.length < JUDGES.length) {
    skipped.push(`B: only ${usable.length} of ${JUDGES.length} judges had credentials`)
  }

  const CASES = [
    { key: 'supported', answer: SUPPORTED_ANSWER, want: 'high' as const },
    { key: 'distilled', answer: HALLUCINATED_ANSWER, want: 'low' as const },
    { key: 'wild', answer: wildAnswer, want: 'low' as const },
  ]

  console.log(
    `  ${'judge'.padEnd(20)} ${'supported'.padEnd(11)} ${'hallu/distilled'.padEnd(17)} ${'hallu/wild'.padEnd(12)} verdict`,
  )
  for (const j of usable) {
    const short = j.id.split('/').pop()!
    const got: Record<string, number | null> = {}
    for (const c of CASES) got[c.key] = await scoreOne(j, context, c.answer)

    if (Object.values(got).some(v => v === null)) {
      const unreadable = CASES.filter(c => got[c.key] === null).map(c => c.key)
      skipped.push(`B/${short}: control case(s) ${unreadable.join(', ')} came back unreadable — verdict unknown, not passed`)
      console.log(`  ${short.padEnd(20)} ` + CASES.map(c => String(got[c.key] ?? 'unreadable').padEnd(c.key === 'supported' ? 11 : 17)).join('') + ' —')
      continue
    }

    const sup = got.supported as number
    const problems: string[] = []
    if (sup < SUPPORTED_FLOOR) problems.push(`supported ${sup} < ${SUPPORTED_FLOOR}`)
    for (const c of CASES.filter(c => c.want === 'low')) {
      const v = got[c.key] as number
      if (v > HALLUCINATED_CEILING) problems.push(`${c.key} ${v} > ${HALLUCINATED_CEILING}`)
      if (sup - v < MIN_DISCRIMINATION) problems.push(`${c.key} gap ${(sup - v).toFixed(2)} < ${MIN_DISCRIMINATION}`)
    }
    if (problems.length) failures.push(`B/${short}: ${problems.join('; ')}`)
    console.log(
      `  ${short.padEnd(20)} ${sup.toFixed(2).padEnd(11)} ${(got.distilled as number).toFixed(2).padEnd(17)} ` +
        `${(got.wild as number).toFixed(2).padEnd(12)} ${problems.length ? 'FAIL — ' + problems.join('; ') : 'ok'}`,
    )
  }
}

// ─── Layer C: the drops ──────────────────────────────────────────────────────
//
// `assay-selfpref.ts` compares only the cases every (judge, generator) pair
// could score. That is the right call — a mean over a different subset per cell
// is not comparable — but it silently changes what the mean is about. If the
// dropped cases are a random subset, n simply falls. If they share a property,
// the surviving mean estimates something narrower than "faithfulness on this
// corpus", and no amount of extra runs will widen it.
//
// The test is reproducibility across runs. Independent runs that drop the same
// cases are not encountering random API noise. The Jaccard threshold matches
// the one `decision-confidence` uses for availability-skew independence.

const JACCARD_SYSTEMATIC = 0.5

type Run = {
  file: string
  queries: string[]
  usable: boolean[]
  scores: Record<string, Record<string, (number | null)[]>>
  judgePrompt?: string
}

function loadRuns(): Run[] {
  const dir = 'fixtures/runs'
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: f, ...JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) }))
    .filter((r: Run) => Array.isArray(r.usable) && r.scores)
}

const jaccard = (a: Set<number>, b: Set<number>) => {
  const inter = [...a].filter(x => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 1 : inter / union
}

function layerC(): void {
  console.log('\nC · drop audit                                        offline, no key needed')
  rule()

  const runs = loadRuns()
  if (runs.length === 0) {
    skipped.push('C: no run files in fixtures/runs — nothing to audit')
    console.log('  SKIP  no runs on disk')
    return
  }

  const droppedSets: { file: string; set: Set<number> }[] = []

  for (const run of runs) {
    const judges = Object.keys(run.scores)
    const n = run.queries.length
    const byJudge: Record<string, number> = {}
    const byCase = new Array<number>(n).fill(0)

    for (const j of judges) {
      byJudge[j] = 0
      for (const g of Object.keys(run.scores[j])) {
        run.scores[j][g].forEach((s, i) => {
          if (s === null) {
            byJudge[j]++
            byCase[i]++
          }
        })
      }
    }

    const dropped = new Set<number>(byCase.map((c, i) => (c > 0 ? i : -1)).filter(i => i >= 0))
    droppedSets.push({ file: run.file, set: dropped })

    console.log(`\n  ${run.file}  (${run.judgePrompt ?? 'prompt unrecorded'})`)
    console.log(`    usable ${run.usable.filter(Boolean).length}/${n}   unreadable cells ${byCase.reduce((a, b) => a + b, 0)}`)
    console.log(
      `    by judge: ` +
        judges.map(j => `${j.split('/').pop()} ${byJudge[j]}`).join('  ') +
        (Object.values(byJudge).some(v => v === 0) ? '   ← not spread across judges' : ''),
    )
    console.log(`    dropped cases: ` + [...dropped].map(i => `#${i} ${run.queries[i]}`).join(' · '))

    // Does anything about the input predict being dropped? Context length is
    // the one property available without another API call, and it is the one
    // that would explain truncation: a longer prompt leaves a reasoning judge
    // fewer tokens to close its <think> block before max_tokens cuts it off.
    const ctx = contextLengths(run.queries)
    if (ctx) {
      const ranked = [...ctx.keys()].sort((a, b) => ctx[b] - ctx[a])
      const ranks = [...dropped].map(i => ranked.indexOf(i) + 1)
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
      const dIdx = [...dropped]
      const kIdx = [...Array(n).keys()].filter(i => !dropped.has(i))
      console.log(
        `    context length: dropped mean ${mean(dIdx.map(i => ctx[i])).toFixed(0)} chars ` +
          `vs kept ${mean(kIdx.map(i => ctx[i])).toFixed(0)}   ` +
          `dropped rank among ${n} by length: ${ranks.sort((a, b) => a - b).join(', ')}`,
      )
    }
  }

  if (droppedSets.length < 2) {
    skipped.push('C: only one run on disk — cross-run reproducibility of the drops is untested')
    console.log('\n  only one run: cannot tell a stratum from an accident. Verdict withheld.')
    return
  }

  console.log('\n  cross-run overlap of dropped cases (Jaccard)')
  let worst = 0
  for (let i = 0; i < droppedSets.length; i++) {
    for (let k = i + 1; k < droppedSets.length; k++) {
      const jc = jaccard(droppedSets[i].set, droppedSets[k].set)
      worst = Math.max(worst, jc)
      console.log(`    ${droppedSets[i].file} ∩ ${droppedSets[k].file} = ${jc.toFixed(2)}`)
    }
  }

  if (worst > JACCARD_SYSTEMATIC) {
    failures.push(
      `C: dropped cases repeat across independent runs (max Jaccard ${worst.toFixed(2)} > ${JACCARD_SYSTEMATIC}). ` +
        `The surviving cases are a stratum, not a sample — the matrix means describe the cases that parse, ` +
        `not the corpus. Fix by raising judge max_tokens (or retrying unreadable cells) and re-running, ` +
        `not by reporting n and moving on.`,
    )
    console.log(`\n  SYSTEMATIC — the same cases fail to parse every time.`)
  } else {
    console.log(`\n  ok — drops do not repeat; treating them as noise is defensible.`)
  }
}

/** Context lengths per case index, read from any frozen answer file. */
function contextLengths(queries: string[]): number[] | null {
  const dir = 'fixtures/answers'
  if (!existsSync(dir)) return null
  const file = readdirSync(dir).find(f => f.endsWith('.json'))
  if (!file) return null
  const answers = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')).answers as {
    query: string
    context: string
  }[]
  const byQuery = new Map(answers.map(a => [a.query, a.context.length]))
  if (!queries.every(q => byQuery.has(q))) return null
  return queries.map(q => byQuery.get(q)!)
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(78))
  console.log('assay sensitivity control — can this pipeline still fail correctly?')
  console.log('═'.repeat(78))

  layerA()
  await layerB()
  layerC()

  console.log('\n' + '═'.repeat(78))
  if (failures.length) {
    console.log(`FAIL — ${failures.length} control${failures.length > 1 ? 's' : ''} did not hold:\n`)
    failures.forEach(f => console.log(`  · ${f}`))
    console.log(
      `\nUntil these hold, numbers from \`npm run eval\` and \`npm run selfpref\` describe the ` +
        `\nharness as much as the models. Do not quote them.`,
    )
    if (skipped.length) {
      console.log('\nalso not run:')
      skipped.forEach(s => console.log(`  · ${s}`))
    }
    console.log('═'.repeat(78))
    process.exit(1)
  }
  if (skipped.length) {
    console.log(`INCOMPLETE — every control that ran held, but some did not run:\n`)
    skipped.forEach(s => console.log(`  · ${s}`))
    console.log(`\nA control that did not run is not a control that passed.`)
    console.log('═'.repeat(78))
    process.exit(2)
  }
  console.log('PASS — parser, judges, and drop structure all behave as specified.')
  console.log('═'.repeat(78))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
