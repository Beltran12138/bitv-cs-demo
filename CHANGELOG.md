# Changelog

All notable changes to this project are documented here.

---

## [1.2.0] — 2026-04-23

### Added
- **Wiki knowledge structure** — `KnowledgeDoc` extended with `id` (stable identifier) and `related` (cross-reference IDs); all 19 FAQ pages now form an interlinked wiki graph inspired by Karpathy's LLM Wiki pattern
- **Cross-reference fallback** — `intentFilter` fills remaining context slots with related pages when primary intent has fewer than `topK` docs (e.g. register query now also surfaces kyc-materials; api query surfaces security-tips)
- **RAG golden eval** — 10 end-to-end test cases in `lib/knowledge/__tests__/rag-eval.test.ts`; each case validates intent classification AND knowledge retrieval in a single pass; runs in CI without API keys

---

## [1.1.0] — 2026-04-23

### Added
- **Query rewrite** — DeepSeek rewrites user query into retrieval-optimised form before pgvector embedding; improves recall for ambiguous or colloquial phrasing; falls back to original query on error
- **Langfuse LLMOps** — optional tracing (`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`); every DeepSeek generation is recorded with model, input, output, token usage, intent, and RAG chunk count
- **Feedback scoring** — `/api/feedback` forwards 👍/👎 rating to Langfuse as a numeric score (`user-feedback`) linked to the originating trace; closes the prompt-iteration loop
- `traceId` propagated from bot API → ChatWidget → feedback API; bound to Supabase message ID via Realtime insertion order

### Fixed
- Jest dependency conflict introduced by `langfuse` install; pinned `jest` / `jest-util` to v29

---

## [1.0.0] — 2026-04-23

### Added
- **RAG knowledge base** — 20 FAQ documents across 9 domains; pgvector cosine search (production) with intent-filter fallback (demo)
- **`/api/seed`** — admin endpoint to embed FAQ docs via OpenAI `text-embedding-3-small` → Supabase `knowledge_chunks`
- **`/api/feedback`** — persist 👍/👎 ratings to `message_feedback` table
- **Message feedback UI** — thumbs up/down on every bot reply in ChatWidget
- **Agent analytics header** — real-time session count, AI resolution rate, transferred count in AgentDashboard
- **IP rate limiting** — 20 req/min per IP on `/api/bot` (in-memory, swap Redis for production)
- **Scoring-based intent classifier** — resolves ambiguous multi-keyword inputs (e.g. "永续合约资金费率")
- **44 unit tests** — full coverage of `classifyIntent` across all intents and edge cases
- **GitHub Actions CI** — test + build on every push, Node 20, `npm ci` with cache
- **`.env.example`** — documents all required and optional environment variables

### Schema additions
- `create extension vector` — pgvector
- `knowledge_chunks` table with `vector(1536)` embedding column and IVFFlat index
- `message_feedback` table with unique constraint per message
- `match_knowledge` PostgreSQL RPC function for cosine similarity search

---

## [0.3.0] — 2026-04-22

### Added
- **DeepSeek AI integration** — live LLM responses via OpenAI-compatible SDK, server-side only
- **8 specialist system prompts** — fee, withdraw, kyc, deposit, security, futures, register, api
- **Multi-agent routing** — intent classifier selects specialist prompt before LLM call
- **Keyword-matching fallback** — activates when `DEEPSEEK_API_KEY` absent or API throws
- **Language instruction injection** — appends zh-CN/zh-TW/en directive to every system prompt

---

## [0.2.0] — 2026-04-21

### Added
- **Safety filter** — detects off-platform solicitation (WeChat/Telegram/OTC), returns fraud warning
- **`no_reply` intent** — silently ignores pure emoji/punctuation messages
- **Waiting timeout** — 3-minute timer inserts reminder if no agent joins after handoff
- **History truncation** — last 50 messages loaded; last 10 sent as LLM context
- **Animated typing indicator** — 3-dot bounce animation during LLM inference
- **AgentDashboard** — real-time agent console with session list, accept flow, reply input

### Fixed
- RLS blocking all DB operations — disabled for demo stage
- Race condition between greeting insert and Realtime subscription setup

---

## [0.1.0] — 2026-04-20

### Added
- Next.js 16 App Router project scaffold (TypeScript + Tailwind CSS)
- Supabase schema: `sessions` + `messages` tables, Realtime enabled
- `ChatWidget` — floating chat bubble, message history, language switcher
- `MessageBubble` — role-aware styling (user / bot / agent)
- `LanguageSwitcher` — zh-CN / zh-TW / en per-session
- `/api/session` — creates session row on chat open
- `/api/bot` — keyword-based intent routing (Phase 1)
- `/chat` user page, `/agent` dashboard page
- Deployed to Vercel: https://cs-demo-beta.vercel.app
