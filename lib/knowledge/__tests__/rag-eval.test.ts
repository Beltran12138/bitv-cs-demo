import { classifyIntent } from '../../agents'
import { getKnowledgeContext, formatContext } from '../search'
import { GOLDEN_CASES, KNOWN_RETRIEVAL_GAPS } from '../../assay/golden'
import { FAQ_DOCS } from '../faq'

// This suite calls the same entry point the application calls
// (`getKnowledgeContext`), rather than reimplementing retrieval. An earlier
// version of this file copied the intent-filter logic inline; the copy passed
// while the production path — query rewrite → embedding → pgvector — was never
// exercised at all.

describe('retrieval golden set — production entry point', () => {
  const originalKey = process.env.OPENAI_API_KEY

  beforeAll(() => {
    // Pin the offline branch: no network, no embeddings, deterministic.
    // The vector path needs its own suite against a seeded database — it is
    // NOT covered here, and pretending otherwise is the bug this file had.
    delete process.env.OPENAI_API_KEY
  })

  afterAll(() => {
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey
  })

  test.each(GOLDEN_CASES)('$query', async ({ query, expectedIntent, contextMustContain }) => {
    const intent = classifyIntent(query)
    expect(intent).toBe(expectedIntent)

    const chunks = await getKnowledgeContext(query, intent)
    const context = formatContext(chunks)

    for (const fact of contextMustContain) {
      expect(context).toContain(fact)
    }
  })

  test('retrieval returns nothing for an intent with no documents', async () => {
    // Guards the shared assumption behind every case above: that a passing
    // assertion means retrieval selected something, not that it returned the
    // whole corpus. If unknown intents also yielded content, the checks above
    // would pass without retrieval doing any work.
    const chunks = await getKnowledgeContext('今天天气怎么样', 'unknown')
    expect(chunks).toHaveLength(0)
  })
})

describe('known retrieval gaps — facts the corpus has but retrieval cannot reach', () => {
  // These assert the defect is still present. When retrieval is fixed, these
  // go red — which is the point: a silent fix would otherwise leave FINDINGS.md
  // describing a problem that no longer exists.
  const originalKey = process.env.OPENAI_API_KEY
  beforeAll(() => { delete process.env.OPENAI_API_KEY })
  afterAll(() => { if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey })

  test.each(KNOWN_RETRIEVAL_GAPS)(
    '$unreachableFact is in the corpus but unreachable for "$query"',
    async ({ query, intent, unreachableFact, livesIn }) => {
      // The fact exists in the corpus...
      const doc = FAQ_DOCS.find(d => d.id === livesIn)
      expect(doc?.content).toContain(unreachableFact)

      // ...and retrieval still does not surface it.
      const chunks = await getKnowledgeContext(query, intent as never)
      const context = formatContext(chunks)
      expect(context).not.toContain(unreachableFact)
    },
  )
})
