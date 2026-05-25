import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Langfuse } from 'langfuse'
import { classifyIntent, processMessage } from '@/lib/agents'
import { SYSTEM_PROMPTS, type AgentPromptKey } from '@/lib/prompts'
import { getKnowledgeContext, formatContext } from '@/lib/knowledge/search'
import { checkRateLimit } from '@/lib/rate-limit'
import { getSupabase } from '@/lib/supabase'
import type { Language } from '@/lib/i18n'
import { sendMessage as larkSend } from '@/lib/lark/client'
import { buildHandoffCard } from '@/lib/lark/cards'
import { createCustomerRecord, updateCustomerRecord, findRecordBySessionId } from '@/lib/lark/base'

// Lazy singleton — avoids module-level init during Next.js build phase
let _lf: Langfuse | null | undefined
function getLangfuse(): Langfuse | null {
  if (_lf !== undefined) return _lf
  const sk = process.env.LANGFUSE_SECRET_KEY?.trim()
  _lf = sk
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY?.trim(),
        secretKey: sk,
        baseUrl: process.env.LANGFUSE_HOST?.trim() ?? 'https://cloud.langfuse.com',
        flushAt: 1,
        flushInterval: 0,
      })
    : null
  return _lf
}

const SAFETY_REPLIES: Record<Language, string> = {
  'zh-CN': '温馨提示：请通过 bitV 官方渠道沟通，切勿将账户信息或资金转至平台外，谨防诈骗。',
  'zh-TW': '溫馨提示：請通過 bitV 官方渠道溝通，切勿將帳戶資訊或資金轉至平台外，謹防詐騙。',
  'en': 'Notice: Please use official bitV channels only. Never share account details or send funds off-platform. Stay safe from scams.',
}

type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 })
  }

  const { message, language, history, sessionId } = await req.json() as {
    message: string
    language: Language
    history: HistoryMessage[]
    sessionId?: string
  }

  const intent = classifyIntent(message)
  const HIGH_ANXIETY = new Set(['kyc', 'withdraw', 'security', 'account'])
  const isHighAnxiety = HIGH_ANXIETY.has(intent)

  // Write intent to session row (non-blocking, non-critical)
  if (sessionId) {
    getSupabase().from('sessions').update({ intent }).eq('id', sessionId).then(() => {})
  }
  const lf = getLangfuse()

  const trace = lf?.trace({
    name: 'bot-request',
    input: { message },
    metadata: { intent, language },
  })

  if (intent === 'no_reply') {
    trace?.update({ output: null, metadata: { intent } })
    if (lf) await lf.flushAsync()
    return NextResponse.json({ reply: null, intent, shouldTransfer: false, isHighAnxiety: false })
  }
  if (intent === 'safety') {
    trace?.update({ output: SAFETY_REPLIES[language], metadata: { intent } })
    if (lf) await lf.flushAsync()
    return NextResponse.json({ reply: SAFETY_REPLIES[language], intent, shouldTransfer: false, traceId: trace?.id, followUpQuestions: [], isHighAnxiety: false })
  }
  if (intent === 'human') {
    trace?.update({ output: 'human-handoff', metadata: { intent } })
    if (lf) await lf.flushAsync()

    // Lark handoff: push card to CS group + create/update base record
    if (sessionId && process.env.LARK_APP_ID && process.env.LARK_CS_CHAT_ID) {
      try { await pushLarkHandoff(sessionId, message, language) }
      catch (e) { console.error('[lark handoff] fail:', e) }
    }

    return NextResponse.json({ reply: null, intent, shouldTransfer: true, traceId: trace?.id, followUpQuestions: [], isHighAnxiety: false })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    const fallback = processMessage(message, language)
    if (lf) await lf.flushAsync()
    return NextResponse.json({ ...fallback, followUpQuestions: [], isHighAnxiety })
  }

  try {
    const chunks = await getKnowledgeContext(message, intent)
    const contextBlock = formatContext(chunks)

    // Collect up to 3 unique follow-up questions from retrieved chunks
    const followUpSet = new Set<string>()
    for (const chunk of chunks) {
      for (const q of (chunk.followUpQuestions ?? [])) {
        if (followUpSet.size < 3) followUpSet.add(q)
      }
    }
    const followUpQuestions = [...followUpSet]

    const promptKey = (intent in SYSTEM_PROMPTS ? intent : 'default') as AgentPromptKey

    const languageInstruction =
      language === 'zh-CN' ? '请用简体中文回答。' :
      language === 'zh-TW' ? '請用繁體中文回答。' :
      'Please reply in English.'

    const noMarkdown = language === 'en'
      ? 'Reply in plain text only. No markdown (no **bold**, no # headings, no - bullet symbols, no backticks).'
      : '请用纯文字回复，禁止使用 Markdown 格式（禁止 **加粗**、# 标题、- 列表符号、代码块等）。'

    const systemContent = `${SYSTEM_PROMPTS[promptKey]}${contextBlock}\n\n${languageInstruction}\n${noMarkdown}`

    const llmMessages = [
      { role: 'system' as const, content: systemContent },
      ...history.slice(-10),
      { role: 'user' as const, content: message },
    ]

    const generation = trace?.generation({
      name: 'deepseek-chat',
      model: 'deepseek-chat',
      input: llmMessages,
      metadata: { intent, promptKey, ragChunks: chunks.length },
    })

    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: llmMessages,
      max_tokens: 300,
      temperature: 0.3,
    })

    const reply = completion.choices[0]?.message?.content?.trim() ?? null

    generation?.end({
      output: reply,
      usage: {
        input: completion.usage?.prompt_tokens,
        output: completion.usage?.completion_tokens,
      },
    })

    if (lf) await lf.flushAsync()
    return NextResponse.json({ reply, intent, shouldTransfer: false, traceId: trace?.id, followUpQuestions, isHighAnxiety })
  } catch {
    const fallback = processMessage(message, language)
    if (lf) await lf.flushAsync()
    return NextResponse.json({ ...fallback, followUpQuestions: [], isHighAnxiety })
  }
}

// ─── Lark handoff helper ─────────────────────────────────────────────────────

async function pushLarkHandoff(sessionId: string, message: string, language: Language): Promise<void> {
  const supabase = getSupabase()
  const chatId = process.env.LARK_CS_CHAT_ID!

  // Use previous user message as context if "human" trigger word alone
  const HUMAN_TRIGGERS = /^(人工|转人工|轉人工|客服|真人|human|agent|support|representative)$/i
  let displayMessage = message
  if (HUMAN_TRIGGERS.test(message.trim())) {
    const { data: prev } = await supabase
      .from('messages')
      .select('content')
      .eq('session_id', sessionId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(2)
    // Skip the current "人工" itself, take previous
    if (prev && prev.length >= 2) displayMessage = prev[1].content
  }

  // 1. find or detect previous intent
  const { data: sess } = await supabase
    .from('sessions')
    .select('intent, lark_base_record_id, lark_thread_root_msg_id')
    .eq('id', sessionId)
    .maybeSingle()
  const intent = sess?.intent ?? 'human'

  // 2. push handoff card to CS group
  const card = buildHandoffCard({ sessionId, userMessage: displayMessage, intent, language })
  const sent = await larkSend({
    receiveId: chatId,
    receiveIdType: 'chat_id',
    msgType: 'interactive',
    content: card,
  })

  // 3. create or update base record
  let recordId = sess?.lark_base_record_id ?? null
  if (!recordId) {
    const existing = await findRecordBySessionId(sessionId).catch(() => null)
    if (existing) {
      recordId = existing.record_id
      await updateCustomerRecord(recordId, {
        intent,
        status: 'waiting',
        last_msg_at: Date.now(),
      }).catch(() => {})
    } else {
      const created = await createCustomerRecord({
        session_id: sessionId,
        user_anon: `用户-${sessionId.slice(0, 6)}`,
        intent,
        status: 'waiting',
        start_at: Date.now(),
        last_msg_at: Date.now(),
        messages_count: 1,
        notes: `首次转人工: ${displayMessage.slice(0, 100)}`,
      }).catch((e) => { console.warn('[base] create:', e); return null })
      recordId = created?.record_id ?? null
    }
  } else {
    await updateCustomerRecord(recordId, {
      intent,
      status: 'waiting',
      last_msg_at: Date.now(),
    }).catch(() => {})
  }

  // 4. persist lark fields on session
  await supabase.from('sessions').update({
    status: 'waiting',
    lark_thread_root_msg_id: sent.message_id,
    lark_base_record_id: recordId,
  }).eq('id', sessionId)
}
