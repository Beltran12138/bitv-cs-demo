# Reddit Post — r/nextjs

**Title:**
Built a multi-agent AI customer service chatbot for a crypto exchange (Next.js + Supabase pgvector + DeepSeek) — open source

---

**Body:**

Hey r/nextjs,

I built an AI customer service system for a crypto exchange demo and open-sourced it. Sharing because I hit some interesting technical challenges that might be useful.

**Live demo:** https://cs-demo-beta.vercel.app/chat (user chat) / https://cs-demo-beta.vercel.app/agent (agent dashboard)
**GitHub:** https://github.com/Beltran12138/bitv-cs-demo

---

**The problem with a single LLM prompt for customer service:**

A crypto exchange has wildly different knowledge domains — KYC verification, withdrawal flows, futures liquidation, API rate limits. One generic prompt hallucinates constantly. You need specialists.

**The architecture:**

```
message → Intent classifier (keyword scoring) 
        → routes to 1 of 8 specialist agents 
        → RAG retrieval (pgvector cosine search OR intent-filter fallback)
        → DeepSeek Chat with injected FAQ context
        → Supabase INSERT → Realtime push → both tabs sync
```

**Interesting problems I solved:**

1. **Ambiguous intent classification** — "永续合约资金费率" (futures funding rate) matched "fee" keywords before "futures". Fixed with scoring (count all keyword hits per intent, pick highest).

2. **Supabase Realtime race condition** — greeting message arrived before subscription was established. Fix: subscribe first, then pull history from DB, then send greeting.

3. **RAG without requiring extra API keys** — implemented two-tier: pgvector cosine search if `OPENAI_API_KEY` present, otherwise filters FAQ docs by classified intent. Demo works out of the box.

4. **API key security** — DeepSeek key is `DEEPSEEK_API_KEY` (no NEXT_PUBLIC_ prefix), only called from server-side route handler.

**Tech stack:**
- Next.js 16 App Router + TypeScript + Tailwind
- Supabase (Realtime + pgvector)
- DeepSeek Chat API (OpenAI-compatible SDK)
- Vercel deployment
- 44 Jest unit tests, GitHub Actions CI

Would love feedback on the architecture — especially the intent routing approach vs. using an LLM for classification.

---

# Reddit Post — r/MachineLearning (or r/LocalLLaMA)

**Title:**
Two-tier RAG for customer service: pgvector semantic search + intent-filter fallback — architecture writeup

**Body:**

Built a customer service chatbot where the RAG retrieval degrades gracefully when embeddings aren't available. Thought the pattern might be interesting.

**The two-tier approach:**

```typescript
export async function getKnowledgeContext(query, intent, topK = 3) {
  if (process.env.OPENAI_API_KEY) {
    // Production: embed query → pgvector cosine similarity
    return vectorSearch(query, intent, topK)
  }
  // Demo/fallback: filter FAQ docs by classified intent
  return intentFilter(intent, topK)
}
```

Both paths inject context the same way into the system prompt — only the retrieval mechanism changes. This means you can demo the full RAG pipeline without an embedding API key, and swap in real vectors without touching any other code.

The intent classifier (keyword scoring, not LLM) runs in <1ms, so the overall chain is: classify → retrieve → augment → generate. Only the generate step hits a paid API.

Full source: https://github.com/Beltran12138/bitv-cs-demo
