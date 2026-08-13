// The single source of truth for expectations.
//
// Both the unit tests and the eval script import this file. Neither one keeps
// its own copy, and neither one reimplements retrieval — a second copy of the
// logic under test would pass and fail in lockstep with the original, which is
// the same as not testing it.

export type GoldenCase = {
  query: string
  expectedIntent: string
  /** Facts that retrieval must surface. Asserted against the context. */
  contextMustContain: string[]
  /**
   * Strings a correct answer is expected to contain. Each entry is one fact;
   * an array of strings means any one of those surface forms counts.
   *
   * ⚠️ This measures the construct `fact_token_presence`, NOT `correctness`.
   * It cannot see a fabrication sitting next to a present token, and a correct
   * paraphrase using none of these strings scores zero. Synonyms below reduce
   * false negatives; they do not turn this into an accuracy measure.
   */
  answerMustContain: (string | string[])[]
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    query: 'maker taker费率是多少',
    expectedIntent: 'fee',
    contextMustContain: ['0.1%', 'maker'],
    answerMustContain: ['0.1%'],
  },
  {
    query: '合约手续费怎么算',
    expectedIntent: 'fee',
    contextMustContain: ['0.02%', '0.05%'],
    answerMustContain: ['0.02%', '0.05%'],
  },
  {
    query: '怎么提币，步骤是什么',
    expectedIntent: 'withdraw',
    contextMustContain: ['资产', 'TxID'],
    answerMustContain: ['提币'],
  },
  {
    query: '提币要多久到账',
    expectedIntent: 'withdraw',
    contextMustContain: ['工作日', 'TxID'],
    answerMustContain: ['TxID'],
  },
  {
    query: 'KYC认证需要什么材料',
    expectedIntent: 'kyc',
    contextMustContain: ['护照', '自拍照'],
    answerMustContain: ['护照'],
  },
  {
    query: '如何充值USDT入金',
    expectedIntent: 'deposit',
    contextMustContain: ['充值地址', '区块链'],
    answerMustContain: ['充值地址'],
  },
  {
    query: '如何开启2FA保护账户',
    expectedIntent: 'security',
    contextMustContain: ['2FA', 'Google Authenticator'],
    answerMustContain: ['Google Authenticator'],
  },
  {
    query: '永续合约最高多少倍杠杆',
    expectedIntent: 'futures',
    contextMustContain: ['100x', '资金费率'],
    // Measured: the agent answers "100 倍杠杆". Correct, and invisible to a
    // literal "100x" match — see the note in constructs.ts.
    answerMustContain: [['100x', '100倍', '100 倍']],
  },
  {
    query: '怎么注册Acme账号',
    expectedIntent: 'register',
    contextMustContain: ['邮箱', 'KYC'],
    answerMustContain: ['邮箱'],
  },
  {
    query: 'API Key权限有哪些',
    expectedIntent: 'api',
    contextMustContain: ['只读', 'API Key'],
    answerMustContain: ['只读'],
  },
  {
    query: '我的订单一直未成交是怎么回事',
    expectedIntent: 'order',
    contextMustContain: ['委托'],
    answerMustContain: ['委托'],
  },
  {
    query: '账户冻结了怎么解冻',
    expectedIntent: 'account',
    contextMustContain: ['工单', '工作日'],
    answerMustContain: ['工单'],
  },
  {
    query: '平台会报税吗，需要交1099表吗',
    expectedIntent: 'compliance',
    contextMustContain: ['1099-DA', 'CSV'],
    answerMustContain: ['1099-DA'],
  },
]

/**
 * Facts the corpus contains but retrieval cannot reach.
 *
 * These are NOT test-authoring mistakes. `intentFilter` takes the first `topK`
 * documents in declaration order, so anything past position `topK` within an
 * intent is unreachable no matter how well it matches. The offline path is what
 * runs whenever `OPENAI_API_KEY` is unset — which is the deployed default.
 *
 * Kept deliberately unfixed: this is the fixture's first real defect and the
 * harness's first regression case. Fixing the fixture would delete the evidence
 * that the check works. See FINDINGS.md #1.
 */
export const KNOWN_RETRIEVAL_GAPS = [
  {
    query: '我的订单一直未成交是怎么回事',
    intent: 'order',
    unreachableFact: 'FOK',
    livesIn: 'order-partial',
    reason: 'position 4 of 4 in the `order` intent; topK = 3',
  },
]

/**
 * Fraction of expected facts whose surface form appears in `text`. An entry
 * that is an array counts as a hit when any of its forms appears.
 *
 * Deterministic, no model, no network. Scores the construct
 * `fact_token_presence` — see the warning on `answerMustContain`.
 */
export function tokenCoverage(text: string, expected: (string | string[])[]): number {
  if (expected.length === 0) return 1
  const hits = expected.filter(entry =>
    Array.isArray(entry) ? entry.some(form => text.includes(form)) : text.includes(entry),
  ).length
  return hits / expected.length
}
