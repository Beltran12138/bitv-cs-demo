import { classifyIntent } from '../../agents'
import { FAQ_DOCS } from '../faq'

type GoldenCase = {
  query: string
  expectedIntent: string
  mustContain: string[]
}

const GOLDEN_CASES: GoldenCase[] = [
  {
    query: 'maker taker费率是多少',
    expectedIntent: 'fee',
    mustContain: ['0.1%', 'maker'],
  },
  {
    query: '合约手续费怎么算',
    expectedIntent: 'fee',
    mustContain: ['0.02%', '0.05%'],
  },
  {
    query: '怎么提币，步骤是什么',
    expectedIntent: 'withdraw',
    mustContain: ['资产', 'TxID'],
  },
  {
    query: '提币要多久到账',
    expectedIntent: 'withdraw',
    mustContain: ['工作日', 'TxID'],
  },
  {
    query: 'KYC认证需要什么材料',
    expectedIntent: 'kyc',
    mustContain: ['护照', '自拍照'],
  },
  {
    query: '如何充值USDT入金',
    expectedIntent: 'deposit',
    mustContain: ['充值地址', '区块链'],
  },
  {
    query: '如何开启2FA保护账户',
    expectedIntent: 'security',
    mustContain: ['2FA', 'Google Authenticator'],
  },
  {
    query: '永续合约最高多少倍杠杆',
    expectedIntent: 'futures',
    mustContain: ['100x', '资金费率'],
  },
  {
    query: '怎么注册bitV账号',
    expectedIntent: 'register',
    mustContain: ['邮箱', 'KYC'],
  },
  {
    query: 'API Key权限有哪些',
    expectedIntent: 'api',
    mustContain: ['只读', 'API Key'],
  },
]

describe('RAG golden eval — intent + knowledge retrieval', () => {
  test.each(GOLDEN_CASES)('$query', ({ query, expectedIntent, mustContain }) => {
    // Step 1: intent classification
    const intent = classifyIntent(query)
    expect(intent).toBe(expectedIntent)

    // Step 2: knowledge retrieval (mirrors intentFilter + cross-reference fallback in search.ts)
    const primary = FAQ_DOCS.filter(d => d.intent === intent)
    const relatedIds = new Set(primary.flatMap(d => d.related))
    const related = FAQ_DOCS.filter(d => relatedIds.has(d.id) && d.intent !== intent)
    const allChunks = [...primary, ...related]

    const combinedText = allChunks.map(d => `${d.title} ${d.content}`).join('\n')

    for (const kw of mustContain) {
      expect(combinedText).toContain(kw)
    }
  })
})
