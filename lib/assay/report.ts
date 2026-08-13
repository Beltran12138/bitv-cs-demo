import {
  type Construct,
  type Method,
  type Observation,
  CONSTRUCT_QUESTION,
  isSelfGraded,
  modelFamily,
} from './constructs'

// A report never collapses observations that answer different questions into a
// single number. When asked to, it says `not_comparable` and shows the groups.

export type FlagLevel = 'info' | 'warn' | 'critical'

export type Flag = {
  code:
    | 'self_graded'          // judge and generator share a model family
    | 'method_mixed'         // one construct scored by incomparable procedures
    | 'single_observation'   // no second opinion for this construct
    | 'grounded_falsehood'   // faithful to context, but the answer is wrong
    | 'correctness_absent'   // nothing in this run measured whether answers are true
  level: FlagLevel
  construct?: Construct
  detail: string
}

export type ConstructGroup = {
  construct: Construct
  question: string
  /** Mean score, but only across observations sharing one method. */
  byMethod: { method: Method; mean: number; n: number }[]
  n: number
}

export type Report = {
  groups: ConstructGroup[]
  /** Present only when every observation shares one construct AND one method. */
  composite: number | null
  verdict: 'comparable' | 'not_comparable'
  confidence: 'high' | 'medium' | 'low'
  flags: Flag[]
}

// ⚠️ UNCALIBRATED. This pair of cutoffs decides when a high faithfulness score
// is reclassified as evidence against the corpus. It is a starting guess, not a
// measured boundary — no dataset has been run to place it. Treat any report
// that hinges on it as provisional until it has been checked against labelled
// cases. Do not cite this threshold as a finding.
export const GROUNDED_FALSEHOOD_FAITHFUL_MIN = 0.8
export const GROUNDED_FALSEHOOD_CORRECT_MAX = 0.5

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function groupByConstruct(observations: Observation[]): ConstructGroup[] {
  const byConstruct = new Map<Construct, Observation[]>()
  for (const o of observations) {
    const bucket = byConstruct.get(o.construct) ?? []
    bucket.push(o)
    byConstruct.set(o.construct, bucket)
  }

  return [...byConstruct.entries()].map(([construct, obs]) => {
    const byMethod = new Map<Method, number[]>()
    for (const o of obs) {
      byMethod.set(o.method, [...(byMethod.get(o.method) ?? []), o.score])
    }
    return {
      construct,
      question: CONSTRUCT_QUESTION[construct],
      byMethod: [...byMethod.entries()].map(([method, scores]) => ({
        method,
        mean: mean(scores),
        n: scores.length,
      })),
      n: obs.length,
    }
  })
}

function detectFlags(observations: Observation[], groups: ConstructGroup[]): Flag[] {
  const flags: Flag[] = []

  // Self-preference: report the pair, not just the fact.
  const selfGraded = observations.filter(isSelfGraded)
  if (selfGraded.length > 0) {
    const pairs = [...new Set(
      selfGraded.map(o => `${o.generator} graded by ${o.judge} (family: ${modelFamily(o.judge!)})`),
    )]
    flags.push({
      code: 'self_graded',
      level: 'critical',
      detail:
        `${selfGraded.length}/${observations.length} observations were graded by the ` +
        `model family that produced them — ${pairs.join('; ')}. ` +
        `Scores carry a systematic upward bias that judge ensembling does not remove.`,
    })
  }

  for (const g of groups) {
    if (g.byMethod.length > 1) {
      flags.push({
        code: 'method_mixed',
        level: 'warn',
        construct: g.construct,
        detail:
          `"${g.question}" was answered by ${g.byMethod.length} different procedures ` +
          `(${g.byMethod.map(m => `${m.method}×${m.n}`).join(', ')}). ` +
          `Same construct, different rulers — the means are reported separately, not pooled.`,
      })
    }
    if (g.n === 1) {
      flags.push({
        code: 'single_observation',
        level: 'info',
        construct: g.construct,
        detail: `Only one observation for "${g.question}". No second opinion; disagreement cannot be detected.`,
      })
    }
  }

  // Absent is unknown, not safe. A run full of high faithfulness and high
  // token coverage says nothing about whether the answers are true, and the
  // report must not let a reader assume otherwise by omission.
  const measuresCorrectness = groups.some(g => g.construct === 'correctness')
  if (!measuresCorrectness && groups.length > 0) {
    const proxies = groups
      .filter(g => g.construct === 'faithfulness' || g.construct === 'fact_token_presence')
      .map(g => g.construct)
    if (proxies.length > 0) {
      flags.push({
        code: 'correctness_absent',
        level: 'warn',
        detail:
          `Nothing in this run measured whether the answers are true. ` +
          `${proxies.join(' and ')} ${proxies.length > 1 ? 'are proxies' : 'is a proxy'} ` +
          `and can both be high while the answer is wrong. ` +
          `Correctness needs a source outside the pipeline — a human label or a ` +
          `deterministic ground truth such as a τ²-bench state diff.`,
      })
    }
  }

  // The signal this harness exists for: the answer is loyal to its context and
  // the context is wrong. High faithfulness is what conceals it.
  const faithful = groups.find(g => g.construct === 'faithfulness')
  const correct = groups.find(g => g.construct === 'correctness')
  if (faithful && correct) {
    const f = mean(faithful.byMethod.map(m => m.mean))
    const c = mean(correct.byMethod.map(m => m.mean))
    if (f >= GROUNDED_FALSEHOOD_FAITHFUL_MIN && c <= GROUNDED_FALSEHOOD_CORRECT_MAX) {
      flags.push({
        code: 'grounded_falsehood',
        level: 'critical',
        detail:
          `faithfulness ${f.toFixed(2)} with correctness ${c.toFixed(2)}: the answer is ` +
          `loyal to the retrieved context and still wrong. This indicts the corpus, ` +
          `not the model — raising faithfulness further would make it worse. ` +
          `(Thresholds uncalibrated.)`,
      })
    }
  }

  return flags
}

export function buildReport(observations: Observation[]): Report {
  if (observations.length === 0) {
    return { groups: [], composite: null, verdict: 'not_comparable', confidence: 'low', flags: [] }
  }

  const groups = groupByConstruct(observations)
  const flags = detectFlags(observations, groups)

  // A composite exists only when there is genuinely one question answered one
  // way. Anything else gets no single number — deliberately, and this is the
  // whole point: a harness that always produces a number cannot warn you.
  const singleConstruct = groups.length === 1
  const singleMethod = singleConstruct && groups[0].byMethod.length === 1
  const comparable = singleConstruct && singleMethod

  const confidence: Report['confidence'] =
    flags.some(f => f.level === 'critical') ? 'low'
    : flags.some(f => f.level === 'warn') || observations.length < 3 ? 'medium'
    : 'high'

  return {
    groups,
    composite: comparable ? groups[0].byMethod[0].mean : null,
    verdict: comparable ? 'comparable' : 'not_comparable',
    confidence,
    flags,
  }
}

export function formatReport(r: Report): string {
  const lines: string[] = []
  lines.push(`verdict: ${r.verdict}   confidence: ${r.confidence}`)
  lines.push(
    r.composite === null
      ? 'composite: (none — observations answer different questions)'
      : `composite: ${r.composite.toFixed(3)}`,
  )
  lines.push('')
  for (const g of r.groups) {
    lines.push(`  ${g.construct}  — ${g.question}`)
    for (const m of g.byMethod) {
      lines.push(`      ${m.method.padEnd(14)} mean ${m.mean.toFixed(3)}  (n=${m.n})`)
    }
  }
  if (r.flags.length > 0) {
    lines.push('')
    for (const f of r.flags) {
      lines.push(`  [${f.level.toUpperCase()}] ${f.code}: ${f.detail}`)
    }
  }
  return lines.join('\n')
}
