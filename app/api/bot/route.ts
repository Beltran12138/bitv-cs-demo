import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { classifyIntent } from '@/lib/agents'
import { SYSTEM_PROMPTS, type AgentPromptKey } from '@/lib/prompts'
import { processMessage } from '@/lib/agents'
import type { Language } from '@/lib/i18n'

const SAFETY_REPLIES: Record<Language, string> = {
  'zh-CN': '温馨提示：请通过 bitV 官方渠道沟通，切勿将账户信息或资金转至平台外，谨防诈骗。',
  'zh-TW': '溫馨提示：請通過 bitV 官方渠道溝通，切勿將帳戶資訊或資金轉至平台外，謹防詐騙。',
  'en': 'Notice: Please use official bitV channels only. Never share account details or send funds off-platform. Stay safe from scams.',
}

type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const { message, language, history } = await req.json() as {
    message: string
    language: Language
    history: HistoryMessage[]
  }

  const intent = classifyIntent(message)

  if (intent === 'no_reply') {
    return NextResponse.json({ reply: null, intent, shouldTransfer: false })
  }
  if (intent === 'safety') {
    return NextResponse.json({ reply: SAFETY_REPLIES[language], intent, shouldTransfer: false })
  }
  if (intent === 'human') {
    return NextResponse.json({ reply: null, intent, shouldTransfer: true })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    // Fallback to keyword matching if API key not configured
    const fallback = processMessage(message, language)
    return NextResponse.json(fallback)
  }

  try {
    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

    const promptKey = (intent in SYSTEM_PROMPTS ? intent : 'default') as AgentPromptKey

    const languageInstruction =
      language === 'zh-CN' ? '请用简体中文回答。' :
      language === 'zh-TW' ? '請用繁體中文回答。' :
      'Please reply in English.'

    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPTS[promptKey]}\n\n${languageInstruction}` },
        ...history.slice(-10), // last 10 messages as context
        { role: 'user', content: message },
      ],
      max_tokens: 300,
      temperature: 0.3,
    })

    const reply = completion.choices[0]?.message?.content?.trim() ?? null
    return NextResponse.json({ reply, intent, shouldTransfer: false })
  } catch {
    // API error → fallback to keyword matching
    const fallback = processMessage(message, language)
    return NextResponse.json(fallback)
  }
}
