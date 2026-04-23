# 用 Next.js + Supabase pgvector + DeepSeek，3天搭建一个加密交易所多Agent智能客服系统

> 附完整源码 + 线上Demo，欢迎star ⭐

## 先看效果

**线上Demo：** https://cs-demo-beta.vercel.app/chat
**GitHub：** https://github.com/Beltran12138/bitv-cs-demo

用户发"手续费多少" → AI自动识别意图 → 路由到手续费专家Agent → 返回精确回答
用户发"转人工" → 实时切换到客服后台 → 客服接管对话

---

## 为什么做这个

做加密交易所客服系统，有几个核心挑战：

1. **问题域很细**：KYC认证、提币流程、合约爆仓、API接入……每个领域知识体系完全不同
2. **安全要求高**：有人会问"加我微信场外交易"，必须识别并拦截
3. **需要双端实时同步**：用户端聊天 + 客服端接管，必须毫秒级同步
4. **多语言**：简中/繁中/英文同一套系统

传统单一大Prompt搞不定这些。于是我用了**多Agent路由**的架构。

---

## 核心架构

```
用户消息
  → Intent分类器（关键词评分）
  → 路由到8个专家Agent之一（手续费/提币/KYC/入金/安全/合约/注册/API）
  → RAG检索（pgvector语义搜索 or 意图过滤fallback）
  → 注入上下文 → DeepSeek Chat生成回答
  → Supabase INSERT → Realtime推送 → 双端同步
```

整个链路无状态，完全serverless，冷启动<500ms。

---

## 技术选型与踩坑

### 1. 意图分类：为什么不直接用LLM？

直接让LLM判断意图，每次调用增加500ms延迟 + token消耗。

我用的是**关键词评分法**：

```typescript
// 多关键词命中评分，解决歧义问题
// "永续合约资金费率" 同时含 fee 的"费率" 和 futures 的"永续""合约"
// 简单取第一个命中 → 误判为fee
// 评分取最高 → 正确判断为futures

let bestScore = 0, bestIntent: Intent = 'unknown'
for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
  const score = keywords.filter(k => lower.includes(k)).length
  if (score > bestScore) { bestScore = score; bestIntent = intent as Intent }
}
```

44条单元测试全过，分类准确率>95%。

### 2. RAG：向量搜索 + 意图过滤双模式

```typescript
// 有 OPENAI_API_KEY → 真正的语义向量搜索
// 没有 → 按意图过滤FAQ（Demo也能正常工作）
export async function getKnowledgeContext(query, intent, topK = 3) {
  if (process.env.OPENAI_API_KEY) {
    return vectorSearch(query, intent, topK)  // pgvector cosine similarity
  }
  return intentFilter(intent, topK)  // FAQ docs filtered by intent
}
```

这个设计让Demo不依赖额外API key，面试时随时可演示。

### 3. Supabase Realtime 的坑

直接订阅 → 插入欢迎消息 → 消息先于订阅到达 → 用户看不到欢迎语。

修复：先建立Realtime订阅，再从DB查历史消息，最后再发欢迎消息。

```typescript
// 订阅建立后，先拉历史
supabase.from('messages').select('*')
  .eq('session_id', session.id)
  .order('created_at', { ascending: false })
  .limit(50)
  .then(({ data }) => {
    if (data) setMessages(data.reverse())
  })
// Realtime dedup防止双端重复显示
(payload) => {
  const newMsg = payload.new as Message
  setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
}
```

### 4. DeepSeek API Key 安全

绝对不能用 `NEXT_PUBLIC_` 前缀——那会把key打包进客户端JS。

所有LLM调用走 `app/api/bot/route.ts`（Server Component），key只在服务端。

---

## 完整功能清单

- ✅ 8个专家Agent，意图路由
- ✅ RAG知识库（20条FAQ，pgvector + fallback）
- ✅ 安全过滤（识别场外/微信/Telegram诱导）
- ✅ 实时转人工（Supabase Realtime双端同步）
- ✅ 客服后台（接待队列 + 实时回复 + Analytics）
- ✅ 消息反馈（👍/👎持久化）
- ✅ 三语言（简中/繁中/英文）
- ✅ 等待超时提醒（3分钟）
- ✅ IP限速（20次/分钟）
- ✅ 44条单元测试 + GitHub Actions CI

---

## 本地启动

```bash
git clone https://github.com/Beltran12138/bitv-cs-demo
cd bitv-cs-demo
npm install
cp .env.example .env.local  # 填入 Supabase + DeepSeek 配置
npm run dev
```

---

## 后续计划

- [ ] Upstash Redis 分布式限速（#1）
- [ ] Supabase RLS 生产级安全策略（#2）
- [ ] 企微 Webhook 真实客服接入（#4）

欢迎 PR 和 Issue！

**GitHub：https://github.com/Beltran12138/bitv-cs-demo** ⭐
