'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabase, type Message, type Session } from '@/lib/supabase'
import { t } from '@/lib/i18n'
import MessageBubble from './MessageBubble'

type Stats = {
  total: number
  botResolved: number
  transferred: number
}

type IntentItem = { intent: string; label: string; count: number }

type AnalyticsData = {
  intentDist: IntentItem[]
  total: number
  botResolved: number
  transferred: number
  trend: { date: string; rate: number; total: number }[]
}

const INTENT_COLORS: Record<string, string> = {
  fee: 'bg-blue-500', withdraw: 'bg-cyan-500', kyc: 'bg-violet-500',
  deposit: 'bg-teal-500', security: 'bg-rose-500', futures: 'bg-orange-500',
  register: 'bg-green-500', api: 'bg-indigo-500', order: 'bg-yellow-500',
  account: 'bg-pink-500', compliance: 'bg-purple-500',
  human: 'bg-amber-500', unknown: 'bg-slate-500',
}

export default function AgentDashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState('')
  const [stats, setStats] = useState<Stats>({ total: 0, botResolved: 0, transferred: 0 })
  const [activeTab, setActiveTab] = useState<'sessions' | 'analytics'>('sessions')
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [kbQuery, setKbQuery] = useState('')
  const [kbResults, setKbResults] = useState<{ title: string; content: string }[]>([])
  const [kbSearchLoading, setKbSearchLoading] = useState(false)
  const [kbIsPopular, setKbIsPopular] = useState(false)

  const selected = sessions.find(s => s.id === selectedId) || null
  const lang = selected?.language ?? 'zh-CN'
  const pending = sessions.filter(s => s.status === 'waiting')
  const active = sessions.filter(s => s.status === 'human')

  useEffect(() => {
    if (activeTab === 'analytics') loadAnalytics()
  }, [activeTab])

  async function loadAnalytics() {
    setAnalyticsLoading(true)
    try {
      const res = await fetch('/api/stats')
      const data: AnalyticsData = await res.json()
      setAnalytics(data)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
    loadStats()

    const sb = getSupabase()
    const channel = sb
      .channel('all-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => { loadSessions(); loadStats() }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [])

  useEffect(() => {
    setSuggestion(null)
    setKbQuery('')
    setKbResults([])
    setKbIsPopular(false)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    loadMessages(selectedId)

    const sb = getSupabase()
    const channel = sb
      .channel(`agent-messages:${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${selectedId}` },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
        }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadSessions() {
    const { data } = await getSupabase()
      .from('sessions')
      .select('*')
      .in('status', ['waiting', 'human'])
      .order('created_at', { ascending: false })
    if (data) setSessions(data as Session[])
  }

  async function loadStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await getSupabase()
      .from('sessions')
      .select('status')
      .gte('created_at', since)
    if (!data) return
    const total = data.length
    const transferred = data.filter(s => s.status === 'waiting' || s.status === 'human').length
    setStats({ total, botResolved: total - transferred, transferred })
  }

  async function loadMessages(sessionId: string) {
    const { data } = await getSupabase()
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])
  }

  async function acceptSession(sessionId: string) {
    const sess = sessions.find(s => s.id === sessionId)
    if (!sess) return

    const sb = getSupabase()
    await sb.from('sessions').update({ status: 'human' }).eq('id', sessionId)
    await sb.from('messages').insert({
      session_id: sessionId,
      role: 'agent',
      content: t[sess.language].agentJoined('小王'),
    })
    setSelectedId(sessionId)
  }

  async function sendReply() {
    if (!reply.trim() || !selectedId) return
    const text = reply.trim()
    setReply('')

    await getSupabase().from('messages').insert({
      session_id: selectedId,
      role: 'agent',
      content: text,
    })
  }

  async function fetchSuggestion() {
    if (!selectedId || !selected) return
    setLoadingSuggestion(true)
    setSuggestion(null)
    try {
      const res = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
          intent: selected.intent,
          language: selected.language,
        }),
      })
      const data = await res.json()
      setSuggestion(data.suggestion)
    } finally {
      setLoadingSuggestion(false)
    }
  }

  async function searchKb() {
    if (!kbQuery.trim()) return
    setKbSearchLoading(true)
    setKbResults([])
    try {
      const res = await fetch('/api/kb-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: kbQuery, intent: selected?.intent }),
      })
      const data = await res.json()
      setKbResults(data.results ?? [])
      setKbIsPopular(data.isPopular ?? false)
    } finally {
      setKbSearchLoading(false)
    }
  }

  const resolutionRate = stats.total > 0
    ? Math.round((stats.botResolved / stats.total) * 100)
    : 0

  return (
    <div className="flex flex-col h-screen bg-[#080c1a]">

      {/* Brand bar */}
      <div className="border-b border-white/5 px-5 py-2.5 flex items-center gap-2.5 flex-shrink-0 bg-[#080c1a]">
        <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-blue-700 rounded flex items-center justify-center">
          <span className="text-white font-black text-[10px] leading-none">V</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">BitV</span>
        <span className="text-slate-600 text-xs ml-1">客服工作台</span>
      </div>

      {/* Header */}
      <div className="border-b border-white/5 px-4 py-2.5 flex items-center gap-4 flex-shrink-0 bg-[#080c1a]">
        {/* Tab switcher */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'sessions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            实时会话
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            运营数据
          </button>
        </div>

        {/* Stats (sessions tab only) */}
        {activeTab === 'sessions' && (
          <div className="flex items-center gap-5">
            <span className="text-xs text-slate-600">今日</span>
            <StatBadge label="总会话" value={stats.total} color="text-slate-300" />
            <StatBadge label="AI解决" value={stats.botResolved} color="text-green-400" />
            <StatBadge label="转人工" value={stats.transferred} color="text-amber-400" />
            <StatBadge
              label="AI解决率"
              value={`${resolutionRate}%`}
              color={resolutionRate >= 60 ? 'text-green-400' : 'text-amber-400'}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-slate-400">实时</span>
        </div>
      </div>

      {/* Pitch banner */}
      {activeTab === 'sessions' && (
        <div className="border-b border-blue-900/30 px-5 py-2 bg-gradient-to-r from-blue-950/60 to-transparent flex-shrink-0">
          <p className="text-[11px] text-blue-300/80 italic">
            ✦ AI 解决 79%，人工专注高焦虑场景 — CS 是增长引擎，不是票务系统
          </p>
        </div>
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="flex-1 overflow-y-auto p-6">
          {analyticsLoading && (
            <div className="text-sm text-slate-500 text-center mt-12">加载中...</div>
          )}
          {!analyticsLoading && analytics && (
            <div className="max-w-2xl mx-auto space-y-8">

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <KpiCard label="30日总会话" value={analytics.total} color="text-slate-200" />
                <KpiCard
                  label="AI解决率"
                  value={`${analytics.total > 0 ? Math.round((analytics.botResolved / analytics.total) * 100) : 0}%`}
                  color="text-green-400"
                />
                <KpiCard
                  label="知识库缺口"
                  value={`${analytics.total > 0
                    ? Math.round(((analytics.intentDist.find(d => d.intent === 'unknown')?.count ?? 0) / analytics.total) * 100)
                    : 0}%`}
                  color="text-amber-400"
                  hint="unknown intent 占比"
                />
              </div>

              {/* Intent distribution */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">意图分布（30日）</h3>
                <div className="space-y-2">
                  {analytics.intentDist.map(({ intent, label, count }) => {
                    const max = analytics.intentDist[0]?.count ?? 1
                    const pct = Math.round((count / max) * 100)
                    const color = INTENT_COLORS[intent] ?? 'bg-slate-500'
                    return (
                      <div key={intent} className="flex items-center gap-3 text-xs">
                        <div className="w-20 text-right text-slate-400 shrink-0">{label}</div>
                        <div className="flex-1 bg-slate-800 rounded-full h-4 overflow-hidden">
                          <div
                            className={`h-4 rounded-full ${color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-6 text-right text-slate-300 shrink-0">{count}</div>
                      </div>
                    )
                  })}
                  {analytics.intentDist.length === 0 && (
                    <div className="text-slate-600 text-xs text-center py-4">
                      暂无数据（需先在 Supabase 执行 ALTER TABLE 加 intent 列）
                    </div>
                  )}
                </div>
              </div>

              {/* 7-day trend */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">7日 AI 解决率趋势</h3>
                <div className="flex items-end gap-2 h-24">
                  {analytics.trend.map(({ date, rate, total }) => (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="relative w-full flex items-end justify-center" style={{ height: '72px' }}>
                        <div
                          className={`w-full rounded-t transition-all duration-500 ${rate >= 60 ? 'bg-green-600' : rate > 0 ? 'bg-amber-600' : 'bg-slate-700'}`}
                          style={{ height: `${rate}%`, minHeight: total > 0 ? '4px' : '0' }}
                          title={`${date}: ${rate}% (${total} 会话)`}
                        />
                      </div>
                      <div className="text-[9px] text-slate-600">{date}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Main layout (sessions tab) */}
      <div className={`flex flex-1 overflow-hidden ${activeTab !== 'sessions' ? 'hidden' : ''}`}>

        {/* Session list sidebar */}
        <div className="w-56 border-r border-slate-800 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">{t[lang].agentPageTitle}</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {pending.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-slate-500 uppercase px-2 mb-1">
                  {t[lang].pendingLabel} ({pending.length})
                </div>
                {pending.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-lg p-2 mb-1 cursor-pointer border transition-colors ${
                      selectedId === s.id
                        ? 'bg-amber-900/30 border-amber-700/50'
                        : 'border-transparent hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-amber-300">🔔 用户#{s.id.slice(-4)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); acceptSession(s.id) }}
                        className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-2 py-0.5 rounded transition-colors"
                      >
                        {t[lang].acceptBtn}
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{t[lang].waitingForAgent}</div>
                  </div>
                ))}
              </div>
            )}

            {active.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase px-2 mb-1">
                  {t[lang].activeLabel} ({active.length})
                </div>
                {active.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-lg p-2 mb-1 cursor-pointer border transition-colors ${
                      selectedId === s.id
                        ? 'bg-blue-900/30 border-blue-700/50'
                        : 'border-transparent hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xs text-slate-300">👤 用户#{s.id.slice(-4)}</span>
                    <div className="text-[10px] text-green-400 mt-0.5">● 进行中</div>
                  </div>
                ))}
              </div>
            )}

            {pending.length === 0 && active.length === 0 && (
              <div className="text-xs text-slate-600 text-center mt-8 px-4">
                暂无会话，等待用户转人工...
              </div>
            )}
          </div>
        </div>

        {/* Conversation panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-medium text-slate-200">用户#{selected.id.slice(-4)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  selected.status === 'waiting'
                    ? 'bg-amber-900/50 text-amber-300'
                    : 'bg-green-900/50 text-green-300'
                }`}>
                  {selected.status === 'waiting' ? '等待接入' : '进行中'}
                </span>
                <span className="text-xs text-slate-500">语言: {selected.language}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} language={selected.language} />
                ))}
                <div ref={bottomRef} />
              </div>

              {selected.status === 'human' ? (
                <div className="border-t border-slate-800 p-4 flex gap-3 flex-shrink-0">
                  <input
                    type="text"
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendReply()}
                    placeholder={t[selected.language].replyPlaceholder}
                    className="flex-1 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                  />
                  <button
                    onClick={sendReply}
                    disabled={!reply.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm transition-colors"
                  >
                    {t[selected.language].send}
                  </button>
                </div>
              ) : (
                <div className="border-t border-slate-800 p-4 text-center flex-shrink-0">
                  <button
                    onClick={() => acceptSession(selected.id)}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-8 py-2 rounded-lg text-sm transition-colors"
                  >
                    {t[selected.language].acceptBtn} 这个会话
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              从左侧选择一个会话
            </div>
          )}
        </div>

        {/* Context panel: handoff summary + agent assist + KB search */}
        {selected && (
          <div className="w-56 border-l border-slate-800 flex flex-col overflow-hidden flex-shrink-0">

            {/* Handoff summary */}
            <div className="px-3 py-3 border-b border-slate-800 flex-shrink-0">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">交接摘要</div>
              {selected.intent && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] text-slate-400">意图</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${INTENT_COLORS[selected.intent] ?? 'bg-slate-700'}`}>
                    {selected.intent}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-slate-400 mb-1.5">
                Bot 回复 {messages.filter(m => m.role === 'bot').length} 次
              </div>
              {messages.filter(m => m.role === 'user').slice(-1)[0] && (
                <div>
                  <div className="text-[10px] text-slate-600 mb-0.5">用户最后发送</div>
                  <div className="text-[10px] text-slate-300 leading-relaxed line-clamp-3">
                    {messages.filter(m => m.role === 'user').slice(-1)[0].content}
                  </div>
                </div>
              )}
            </div>

            {/* Agent Assist */}
            {selected.status === 'human' && (
              <div className="px-3 py-3 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">AI 建议</div>
                  <button
                    onClick={fetchSuggestion}
                    disabled={loadingSuggestion}
                    className="text-[10px] bg-blue-900/60 hover:bg-blue-800/60 text-blue-300 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                  >
                    {loadingSuggestion ? '生成中...' : '获取建议'}
                  </button>
                </div>
                {suggestion && (
                  <div className="bg-blue-950/40 border border-blue-800/30 rounded-lg p-2">
                    <div className="text-[11px] text-slate-300 mb-2 leading-relaxed">{suggestion}</div>
                    <button
                      onClick={() => { setReply(suggestion); setSuggestion(null) }}
                      className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-0.5 rounded transition-colors"
                    >
                      采纳
                    </button>
                  </div>
                )}
                {!suggestion && !loadingSuggestion && (
                  <div className="text-[10px] text-slate-600">点击获取 AI 建议回复</div>
                )}
              </div>
            )}

            {/* KB Search */}
            <div className="px-3 py-3 flex-1 overflow-y-auto">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">知识库搜索</div>
              <div className="flex gap-1 mb-2">
                <input
                  type="text"
                  value={kbQuery}
                  onChange={e => setKbQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchKb()}
                  placeholder="搜索FAQ..."
                  className="flex-1 bg-slate-800 text-white text-[11px] rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-600 min-w-0"
                />
                <button
                  onClick={searchKb}
                  disabled={!kbQuery.trim() || kbSearchLoading}
                  className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  查
                </button>
              </div>
              {kbSearchLoading && (
                <div className="text-[10px] text-slate-600 text-center py-2">搜索中...</div>
              )}
              {kbIsPopular && kbResults.length > 0 && (
                <div className="text-[10px] text-slate-600 mb-1.5">热门文章</div>
              )}
              {kbResults.map((r, i) => (
                <div key={i} className="mb-2 bg-slate-800/50 border border-slate-700/50 rounded-lg p-2">
                  <div className="text-[10px] font-medium text-blue-400 mb-1">{r.title}</div>
                  <div className="text-[10px] text-slate-400 leading-relaxed line-clamp-4">{r.content}</div>
                </div>
              ))}
              {kbResults.length === 0 && !kbSearchLoading && kbQuery && (
                <div className="text-[10px] text-slate-600 text-center py-2">无结果</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, hint }: { label: string; value: string | number; color: string; hint?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {hint && <div className="text-[10px] text-slate-600 mt-0.5">{hint}</div>}
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-bold leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-600 mt-0.5">{label}</span>
    </div>
  )
}
