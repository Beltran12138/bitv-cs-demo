import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { Language } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { messages, intent, language } = await req.json() as {
    messages: { role: string; content: string }[]
    intent?: string
    language: Language
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ suggestion: null })

  const lang =
    language === 'en' ? 'English' :
    language === 'zh-TW' ? '繁體中文' :
    '简体中文'

  const systemPrompt = `你是 Acme 加密货币交易平台的资深人工客服专员。根据对话历史，为座席生成一条简洁、专业的建议回复。
用户意图：${intent ?? '未知'}
回复语言：${lang}
要求：简洁不超过80字，专业友好，直接给出建议回复文字，不加任何前缀说明。`

  try {
    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-6).map(m => ({
          role: (m.role === 'agent' || m.role === 'bot' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: '请生成一条针对当前用户问题的建议回复' },
      ],
      max_tokens: 150,
      temperature: 0.5,
    })
    const suggestion = completion.choices[0]?.message?.content?.trim() ?? null
    return NextResponse.json({ suggestion })
  } catch {
    return NextResponse.json({ suggestion: null })
  }
}
