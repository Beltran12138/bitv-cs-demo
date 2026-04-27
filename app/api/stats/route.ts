import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const INTENT_LABELS: Record<string, string> = {
  fee:        '手续费',
  withdraw:   '提币',
  kyc:        'KYC认证',
  deposit:    '充值',
  security:   '账户安全',
  futures:    '合约交易',
  register:   '注册开户',
  api:        'API接口',
  order:      '订单管理',
  account:    '账户/VIP',
  compliance: '合规税务',
  human:      '转人工',
  unknown:    '未识别',
}

export async function GET() {
  const supabase = getSupabase()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('intent, status, created_at')
    .gte('created_at', since)

  if (error || !sessions) {
    return NextResponse.json({ intentDist: [], total: 0, botResolved: 0, transferred: 0 })
  }

  const total = sessions.length
  const transferred = sessions.filter(s => s.status === 'waiting' || s.status === 'human').length
  const botResolved = total - transferred

  const intentCounts: Record<string, number> = {}
  for (const s of sessions) {
    const key = s.intent ?? 'unknown'
    intentCounts[key] = (intentCounts[key] ?? 0) + 1
  }

  const intentDist = Object.entries(intentCounts)
    .map(([intent, count]) => ({ intent, label: INTENT_LABELS[intent] ?? intent, count }))
    .sort((a, b) => b.count - a.count)

  // 7-day daily resolution rate trend
  const days: { date: string; rate: number; total: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const dateStr = day.toISOString().slice(0, 10)
    const daySessions = sessions.filter(s => s.created_at.slice(0, 10) === dateStr)
    const dayTotal = daySessions.length
    const dayTransferred = daySessions.filter(s => s.status === 'waiting' || s.status === 'human').length
    const rate = dayTotal > 0 ? Math.round(((dayTotal - dayTransferred) / dayTotal) * 100) : 0
    days.push({ date: dateStr.slice(5), rate, total: dayTotal })
  }

  return NextResponse.json({ intentDist, total, botResolved, transferred, trend: days })
}
