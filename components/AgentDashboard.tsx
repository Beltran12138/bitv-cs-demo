'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, type Message, type Session } from '@/lib/supabase'
import { t } from '@/lib/i18n'
import MessageBubble from './MessageBubble'

type Stats = {
  total: number
  botResolved: number
  transferred: number
}

export default function AgentDashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState('')
  const [stats, setStats] = useState<Stats>({ total: 0, botResolved: 0, transferred: 0 })
  const bottomRef = useRef<HTMLDivElement>(null)

  const selected = sessions.find(s => s.id === selectedId) || null
  const lang = selected?.language ?? 'zh-CN'
  const pending = sessions.filter(s => s.status === 'waiting')
  const active = sessions.filter(s => s.status === 'human')

  useEffect(() => {
    loadSessions()
    loadStats()

    const channel = supabase
      .channel('all-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => { loadSessions(); loadStats() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    loadMessages(selectedId)

    const channel = supabase
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

    return () => { supabase.removeChannel(channel) }
  }, [selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .in('status', ['waiting', 'human'])
      .order('created_at', { ascending: false })
    if (data) setSessions(data as Session[])
  }

  async function loadStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('sessions')
      .select('status')
      .gte('created_at', since)
    if (!data) return
    const total = data.length
    const transferred = data.filter(s => s.status === 'waiting' || s.status === 'human').length
    setStats({ total, botResolved: total - transferred, transferred })
  }

  async function loadMessages(sessionId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])
  }

  async function acceptSession(sessionId: string) {
    const sess = sessions.find(s => s.id === sessionId)
    if (!sess) return

    await supabase.from('sessions').update({ status: 'human' }).eq('id', sessionId)
    await supabase.from('messages').insert({
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

    await supabase.from('messages').insert({
      session_id: selectedId,
      role: 'agent',
      content: text,
    })
  }

  const resolutionRate = stats.total > 0
    ? Math.round((stats.botResolved / stats.total) * 100)
    : 0

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1e]">

      {/* Analytics header */}
      <div className="border-b border-slate-800 px-6 py-3 flex items-center gap-6 flex-shrink-0">
        <span className="text-xs text-slate-500 uppercase tracking-wider">今日统计</span>
        <StatBadge label="总会话" value={stats.total} color="text-slate-300" />
        <StatBadge label="AI解决" value={stats.botResolved} color="text-green-400" />
        <StatBadge label="转人工" value={stats.transferred} color="text-amber-400" />
        <StatBadge
          label="AI解决率"
          value={`${resolutionRate}%`}
          color={resolutionRate >= 60 ? 'text-green-400' : 'text-amber-400'}
        />
        <div className="ml-auto flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-slate-400">实时</span>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">

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
                    className="flex-1 bg-slate-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
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
      </div>
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
