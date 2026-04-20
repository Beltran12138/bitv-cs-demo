'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, type Message, type Session } from '@/lib/supabase'
import { t } from '@/lib/i18n'
import MessageBubble from './MessageBubble'

export default function AgentDashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const selected = sessions.find(s => s.id === selectedId) || null
  const lang = selected?.language ?? 'zh-CN'
  const pending = sessions.filter(s => s.status === 'waiting')
  const active = sessions.filter(s => s.status === 'human')

  // Load all active/waiting sessions and subscribe to session changes
  useEffect(() => {
    loadSessions()

    const channel = supabase
      .channel('all-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => loadSessions()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Subscribe to messages for selected session
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

  // Auto-scroll
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

  return (
    <div className="flex h-screen bg-[#0a0f1e]">

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
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-3">
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
              <div className="border-t border-slate-800 p-4 flex gap-3">
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
              <div className="border-t border-slate-800 p-4 text-center">
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
  )
}
