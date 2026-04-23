# LinkedIn Post

**Hook (first 2 lines — must grab before "see more"):**

I built a production-grade AI customer service system for a crypto exchange from scratch in 3 days — and open-sourced it.

Here's what I learned about multi-agent architecture and RAG:

---

**Full post:**

I built a production-grade AI customer service system for a crypto exchange from scratch in 3 days — and open-sourced it.

Here's what I learned about multi-agent architecture and RAG:

**The problem with a single AI prompt:**
Crypto customer service spans wildly different domains — KYC verification, withdrawal flows, futures liquidation, API integration. One generic prompt hallucinates on 40%+ of queries. You need specialists.

**The solution — 8 specialist agents with intent routing:**

→ User message arrives
→ Keyword scoring classifier (< 1ms, no LLM cost) routes to 1 of 8 domains
→ RAG retrieves relevant FAQ context (pgvector semantic search)
→ Domain-specific system prompt + context → DeepSeek generates grounded reply
→ If 3 consecutive misses → auto-escalate to human agent (Supabase Realtime)

**3 non-obvious lessons:**

1. Use keyword scoring for intent classification, not an LLM. Saves 500ms + API costs per message. 44 unit tests keep it honest.

2. RAG should degrade gracefully. I implemented intent-filter fallback so the demo works without an embedding API key. Swap in pgvector for production — zero code changes elsewhere.

3. Never put API keys in NEXT_PUBLIC_ env vars. All LLM calls go through a server-side route handler. Obvious in hindsight, easy to miss when shipping fast.

**Tech stack:**
Next.js 16 · TypeScript · Supabase (pgvector + Realtime) · DeepSeek API · Vercel

Live demo: https://cs-demo-beta.vercel.app/chat
GitHub (⭐ welcome): https://github.com/Beltran12138/bitv-cs-demo

What's your approach to multi-agent routing in production?

#AI #NextJS #RAG #BuildInPublic #OpenSource #MachineLearning

---

# Twitter/X Thread

**Tweet 1 (hook):**
Built a multi-agent AI customer service bot for a crypto exchange. Open-sourced it.

The architecture that made it work 🧵

**Tweet 2:**
Problem: crypto CS spans totally different domains
- KYC verification
- Withdrawal flows  
- Futures liquidation
- API integration

One prompt hallucinates on 40%+ of queries. Need specialists.

**Tweet 3:**
Solution: intent routing + specialist agents

```
message → classifier → 1 of 8 specialist agents
        → RAG context injection
        → DeepSeek generates grounded reply
```

Classifier runs in <1ms. No LLM cost for routing.

**Tweet 4:**
The RAG fallback trick:

If OPENAI_API_KEY exists → pgvector cosine search
Otherwise → filter FAQ docs by classified intent

Same context injection either way. Demo works without embedding API. Swap in vectors for prod, zero other changes.

**Tweet 5:**
Interesting bug: "永续合约资金费率" (futures funding rate) classified as "fee" because it contains the character for "rate".

Fix: score ALL keyword hits per intent, pick highest. Not just first match.

Now 44 tests pass.

**Tweet 6:**
Real-time human handoff via Supabase Realtime.

User hits 3 misses or clicks "talk to human" → session status flips to "waiting" → agent dashboard pings instantly → agent accepts → takes over conversation

Sub-100ms across tabs.

**Tweet 7:**
Stack:
- Next.js 16 App Router
- Supabase (pgvector + Realtime)  
- DeepSeek Chat API
- Vercel

Live demo: cs-demo-beta.vercel.app/chat

GitHub ⭐: github.com/Beltran12138/bitv-cs-demo
