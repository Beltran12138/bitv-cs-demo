import { buildReport } from '../report'
import { isSelfGraded, modelFamily, type Observation } from '../constructs'
import { tokenCoverage } from '../golden'

// Assertions here are anchored to what the report should *mean*, not to a
// second copy of how it is computed. Where a number appears, it is a number a
// reader could verify by hand from the inputs.

function obs(o: Partial<Observation> & Pick<Observation, 'construct' | 'score'>): Observation {
  return {
    method: 'llm_judge',
    generator: 'deepseek-chat',
    judge: 'gpt-4o',
    source: 'test',
    ...o,
  }
}

describe('composite: withheld only when the question differs', () => {
  // Guards the failure mode of a harness like this: refusing to answer is not
  // a judgement. If it can only ever say "not comparable", it is unfalsifiable.
  test('one construct, one method → a composite IS produced', () => {
    const r = buildReport([
      obs({ construct: 'correctness', score: 0.8 }),
      obs({ construct: 'correctness', score: 0.6 }),
      obs({ construct: 'correctness', score: 0.7 }),
    ])
    expect(r.verdict).toBe('comparable')
    expect(r.composite).toBeCloseTo(0.7, 5) // (0.8+0.6+0.7)/3, verifiable by hand
  })

  test('faithfulness and correctness are never averaged together', () => {
    const r = buildReport([
      obs({ construct: 'faithfulness', score: 0.9 }),
      obs({ construct: 'correctness', score: 0.3 }),
    ])
    expect(r.verdict).toBe('not_comparable')
    expect(r.composite).toBeNull()
    // Both groups survive intact — the report shows them, it does not smooth them.
    expect(r.groups.map(g => g.construct).sort()).toEqual(['correctness', 'faithfulness'])
  })

  test('same construct, different procedures → means stay separate', () => {
    const r = buildReport([
      obs({ construct: 'correctness', method: 'deterministic', judge: null, score: 0.4 }),
      obs({ construct: 'correctness', method: 'llm_judge', score: 1.0 }),
    ])
    expect(r.composite).toBeNull()
    const group = r.groups.find(g => g.construct === 'correctness')!
    expect(group.byMethod).toHaveLength(2)
    // A pooled mean would be 0.7 — a number describing neither procedure.
    expect(group.byMethod.map(m => m.mean).sort()).toEqual([0.4, 1.0])
    expect(r.flags.map(f => f.code)).toContain('method_mixed')
  })
})

describe('self-preference', () => {
  test('same family generator and judge is flagged critical', () => {
    const r = buildReport([
      obs({ construct: 'correctness', generator: 'deepseek-chat', judge: 'deepseek-chat', score: 0.9 }),
    ])
    const flag = r.flags.find(f => f.code === 'self_graded')
    expect(flag?.level).toBe('critical')
    expect(r.confidence).toBe('low')
  })

  test('different families are not flagged', () => {
    const r = buildReport([
      obs({ construct: 'correctness', generator: 'deepseek-chat', judge: 'gpt-4o', score: 0.9 }),
    ])
    expect(r.flags.map(f => f.code)).not.toContain('self_graded')
  })

  test('family is matched across checkpoints, not by exact string', () => {
    expect(modelFamily('deepseek-chat')).toBe(modelFamily('deepseek-reasoner'))
    expect(modelFamily('gpt-4o-mini')).toBe(modelFamily('o3'))
    expect(modelFamily('claude-opus-5')).not.toBe(modelFamily('gemini-2.5-pro'))
  })

  test('router-style vendor/model ids resolve to their family', () => {
    // Real ids from a router endpoint. Before this was handled, both fell
    // through to the identity branch — so a Kimi judge grading Kimi output
    // would have been reported as cross-family, i.e. the check would have
    // failed silently in exactly the case it exists for.
    expect(modelFamily('moonshotai/Kimi-K2.6')).toBe('moonshot')
    expect(modelFamily('MiniMaxAI/MiniMax-M2.7')).toBe('minimax')
    expect(modelFamily('moonshotai/Kimi-K2.6')).toBe(modelFamily('kimi-k2'))
    expect(modelFamily('moonshotai/Kimi-K2.6')).not.toBe(modelFamily('deepseek-chat'))
  })

  test('an unrecognised model name does not get a free pass', () => {
    // Absent is unknown, not safe: falling back to the raw string means an
    // unknown model still collides with itself instead of silently reading as
    // "some other family".
    const same = isSelfGraded(obs({
      construct: 'correctness', generator: 'internal-model-v3', judge: 'internal-model-v3', score: 1,
    }))
    expect(same).toBe(true)
  })

  test('deterministic scoring has no judge to be biased', () => {
    const r = buildReport([
      obs({ construct: 'correctness', method: 'deterministic', generator: 'deepseek-chat', judge: null, score: 0.5 }),
    ])
    expect(r.flags.map(f => f.code)).not.toContain('self_graded')
  })
})

describe('grounded falsehood', () => {
  test('faithful to context and still wrong → critical, blamed on the corpus', () => {
    const r = buildReport([
      obs({ construct: 'faithfulness', score: 0.95 }),
      obs({ construct: 'correctness', score: 0.30 }),
    ])
    const flag = r.flags.find(f => f.code === 'grounded_falsehood')
    expect(flag?.level).toBe('critical')
    expect(flag?.detail).toContain('corpus')
  })

  test('faithful and correct → no flag', () => {
    const r = buildReport([
      obs({ construct: 'faithfulness', score: 0.95 }),
      obs({ construct: 'correctness', score: 0.90 }),
    ])
    expect(r.flags.map(f => f.code)).not.toContain('grounded_falsehood')
  })

  test('unfaithful and wrong is a different problem, not this one', () => {
    // Both low means the model ignored its context — a generation bug. The
    // corpus is not implicated, so this flag must stay silent.
    const r = buildReport([
      obs({ construct: 'faithfulness', score: 0.2 }),
      obs({ construct: 'correctness', score: 0.2 }),
    ])
    expect(r.flags.map(f => f.code)).not.toContain('grounded_falsehood')
  })
})

describe('correctness is never assumed from a proxy', () => {
  test('a run with only proxies is flagged as not measuring truth', () => {
    const r = buildReport([
      obs({ construct: 'faithfulness', score: 1.0 }),
      obs({ construct: 'fact_token_presence', method: 'deterministic', judge: null, score: 1.0 }),
    ])
    const flag = r.flags.find(f => f.code === 'correctness_absent')
    expect(flag).toBeDefined()
    // Perfect scores on both proxies must not read as "the answers are right".
    expect(flag!.detail).toContain('proxies')
  })

  test('once correctness is actually measured, the flag goes away', () => {
    const r = buildReport([
      obs({ construct: 'faithfulness', score: 1.0 }),
      obs({ construct: 'correctness', method: 'human', judge: null, score: 0.9 }),
    ])
    expect(r.flags.map(f => f.code)).not.toContain('correctness_absent')
  })
})

describe('surface-form coverage', () => {
  // Anchored to a measured case: asked for maximum leverage, the reference
  // agent replied "Acme 的永续合约最高支持 100 倍杠杆" while the expected token
  // was "100x". Correct answer, zero score — the defect that split
  // fact_token_presence out of correctness.
  const MEASURED_ANSWER = 'Acme 的永续合约最高支持 **100 倍杠杆**。'

  test('a literal-only expectation misses a correct paraphrase', () => {
    expect(tokenCoverage(MEASURED_ANSWER, ['100x'])).toBe(0)
  })

  test('accepted surface forms recover it', () => {
    expect(tokenCoverage(MEASURED_ANSWER, [['100x', '100倍', '100 倍']])).toBe(1)
  })

  test('but coverage still cannot see a fabrication next to a present token', () => {
    // Every expected string is there, and the claim is false. This is why the
    // construct is named for what it measures.
    const fabricated = '最高 100 倍杠杆，且平台承诺任何亏损全额赔付。'
    expect(tokenCoverage(fabricated, [['100x', '100倍', '100 倍']])).toBe(1)
  })
})

describe('empty input', () => {
  test('no observations yields no score and low confidence', () => {
    const r = buildReport([])
    expect(r.composite).toBeNull()
    expect(r.confidence).toBe('low')
  })
})
