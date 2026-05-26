// Manual handoff endpoint — called by ChatWidget when user clicks 转人工 button
// or after N consecutive no-match auto-transfers.
// /api/bot already handles intent=human path; this covers the front-end-driven path.

import { NextRequest, NextResponse } from 'next/server'
import { pushLarkHandoff } from '@/lib/lark/handoff'
import type { Language } from '@/lib/i18n'

export async function POST(req: NextRequest) {
  const { sessionId, message, language, reason } = await req.json() as {
    sessionId: string
    message?: string
    language: Language
    reason?: 'manual_button' | 'auto_no_match' | string
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const larkConfigured = !!(process.env.LARK_APP_ID && process.env.LARK_CS_CHAT_ID)
  if (!larkConfigured) {
    return NextResponse.json({ ok: false, error: 'lark not configured' }, { status: 200 })
  }

  try {
    const triggerMsg = message?.trim() || '人工'
    const result = await pushLarkHandoff(sessionId, triggerMsg, language ?? 'zh-CN')
    return NextResponse.json({ ok: true, reason, ...result })
  } catch (e) {
    console.error('[handoff] fail:', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
