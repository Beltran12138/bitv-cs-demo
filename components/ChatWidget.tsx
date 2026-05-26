'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabase, type Message, type Session } from '@/lib/supabase'
import { t, type Language } from '@/lib/i18n'
import type { ProcessResult } from '@/lib/agents'

type BotResponse = ProcessResult & { followUpQuestions?: string[]; isHighAnxiety?: boolean }
import MessageBubble from './MessageBubble'
import LanguageSwitcher from './LanguageSwitcher'

const WAITING_TIMEOUT_MS = 3 * 60 * 1000
const MESSAGE_HISTORY_LIMIT = 50

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const noMatchCountRef = useRef(0)
  const sessionRef = useRef<Session | null>(null)
  const [isTransferring, setIsTransferring] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [feedback, setFeedback] = useState<Record<string, 1 | -1 | 'sent'>>({})
  const [followUps, setFollowUps] = useState<string[]>([])
  const pendingTraceIdRef = useRef<string | null>(null)
  const traceIdMapRef = useRef<Record<string, string>>({})
  const [isHighAnxiety, setIsHighAnxiety] = useState(false)
  const [waitingElapsed, setWaitingElapsed] = useState(0)
  const [showCsat, setShowCsat] = useState(false)
  const [csatRating, setCsatRating] = useState(0)
  const [csatSubmitted, setCsatSubmitted] = useState(false)

  useEffect(() => {
    if (isOpen && !session) {
      initSession()
    }
  }, [isOpen, session])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (session?.status !== 'waiting') {
      setWaitingElapsed(0)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => {
      setWaitingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [session?.status])

  useEffect(() => {
    if (session?.status === 'waiting') {
      waitingTimerRef.current = setTimeout(async () => {
        if (sessionRef.current?.status === 'waiting') {
          await getSupabase().from('messages').insert({
            session_id: sessionRef.current.id,
            role: 'bot',
            content: t[language].waitingTimeout,
          })
        }
      }, WAITING_TIMEOUT_MS)
    } else {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current)
        waitingTimerRef.current = null
      }
    }
    return () => {
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    }
  }, [session?.status])

  useEffect(() => {
    if (!session) return

    const sb = getSupabase()

    sb.from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT)
      .then(({ data }) => {
        if (data) setMessages((data as Message[]).reverse())
      })

    const msgChannel = sb
      .channel(`messages:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` },
        (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.role === 'bot' && pendingTraceIdRef.current) {
            traceIdMapRef.current[newMsg.id] = pendingTraceIdRef.current
            pendingTraceIdRef.current = null
          }
          setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
        }
      )
      .subscribe()

    const sessionChannel = sb
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as Session
          setSession(updated)
          sessionRef.current = updated
          if (updated.status === 'human') {
            setIsTransferring(false)
          }
        }
      )
      .subscribe()

    return () => {
      sb.removeChannel(msgChannel)
      sb.removeChannel(sessionChannel)
    }
  }, [session?.id])

  async function initSession() {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    })
    if (!res.ok) return
    const newSession: Session = await res.json()
    setSession(newSession)
    sessionRef.current = newSession

    await getSupabase().from('messages').insert({
      session_id: newSession.id,
      role: 'bot',
      content: t[language].greeting,
    })
  }

  async function dispatch(text: string) {
    if (!session) return
    setFollowUps([])
    setIsHighAnxiety(false)

    await getSupabase().from('messages').insert({
      session_id: session.id,
      role: 'user',
      content: text,
    })

    if (session.status === 'human') return

    setIsThinking(true)
    let result: BotResponse
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language,
          sessionId: session.id,
          history: messages.slice(-10).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        }),
      })
      result = await res.json()
      if (result.traceId) pendingTraceIdRef.current = result.traceId
      if (result.isHighAnxiety) setIsHighAnxiety(true)
    } finally {
      setIsThinking(false)
    }

    if (result.intent === 'no_reply') return

    if (result.shouldTransfer) {
      noMatchCountRef.current = 0
      // /api/bot already handled Lark push for intent=human; skip duplicate
      await triggerTransferLocalOnly(t[language].autoTransfer)
      return
    }

    if (result.reply) {
      noMatchCountRef.current = 0
      setFollowUps(result.followUpQuestions ?? [])
      await getSupabase().from('messages').insert({
        session_id: session.id,
        role: 'bot',
        content: result.reply,
      })
    } else {
      noMatchCountRef.current += 1

      if (noMatchCountRef.current >= 3) {
        noMatchCountRef.current = 0
        await triggerTransfer(t[language].autoTransfer, 'auto_no_match')
      } else {
        await getSupabase().from('messages').insert({
          session_id: session.id,
          role: 'bot',
          content: t[language].noMatchOnce,
        })
      }
    }
  }

  async function handleSend() {
    if (!input.trim() || !session) return
    const text = input.trim()
    setInput('')
    await dispatch(text)
  }

  // Local-only: just bumps UI status; used when /api/bot already pushed Lark (intent=human)
  async function triggerTransferLocalOnly(message?: string) {
    if (!sessionRef.current || sessionRef.current.status !== 'bot') return
    const currentSession = sessionRef.current
    setIsTransferring(true)
    setIsHighAnxiety(false)
    const sb = getSupabase()
    await sb.from('messages').insert({
      session_id: currentSession.id,
      role: 'bot',
      content: message || t[language].transferring,
    })
    await sb.from('sessions').update({ status: 'waiting' }).eq('id', currentSession.id)
  }

  async function triggerTransfer(message?: string, reason: 'manual_button' | 'auto_no_match' = 'manual_button') {
    if (!sessionRef.current || sessionRef.current.status !== 'bot') return
    const currentSession = sessionRef.current
    setIsTransferring(true)
    setIsHighAnxiety(false)

    const sb = getSupabase()
    await sb.from('messages').insert({
      session_id: currentSession.id,
      role: 'bot',
      content: message || t[language].transferring,
    })

    await sb
      .from('sessions')
      .update({ status: 'waiting' })
      .eq('id', currentSession.id)

    // Trigger backend Lark handoff (fire-and-forget — non-blocking UX)
    fetch('/api/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSession.id,
        language,
        reason,
      }),
    }).catch((e) => console.warn('[handoff] fail:', e))
  }

  async function handleLanguageChange(lang: Language) {
    setLanguage(lang)
    if (session) {
      await getSupabase().from('sessions').update({ language: lang }).eq('id', session.id)
    }
  }

  async function submitFeedback(messageId: string, rating: 1 | -1) {
    setFeedback(prev => ({ ...prev, [messageId]: rating }))
    try {
      const traceId = traceIdMapRef.current[messageId]
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating, ...(traceId && { traceId }) }),
      })
      setTimeout(() => {
        setFeedback(prev => ({ ...prev, [messageId]: 'sent' }))
      }, 800)
    } catch {
      // feedback failure is non-critical
    }
  }

  const canTransfer = session?.status === 'bot' && !isTransferring

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center text-2xl shadow-lg transition-all z-50"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      {isOpen && (
        <>
        {/* CSAT overlay — separate fixed element, same position/size as chat window */}
        {showCsat && (
          <div
            className="fixed bottom-24 right-6 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl flex flex-col items-center justify-center z-[60]"
            style={{ height: '520px' }}
          >
            <div className="text-center px-6">
              <div className="text-3xl mb-3">⭐</div>
              <div className="text-sm font-medium text-slate-200 mb-5">{t[language].csatTitle}</div>
              <div className="flex gap-3 justify-center mb-6">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setCsatRating(star)}
                    className={`text-3xl transition-transform hover:scale-110 ${star <= csatRating ? 'text-yellow-400' : 'text-slate-600'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowCsat(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5"
                >
                  {t[language].csatSkip}
                </button>
                <button
                  disabled={csatRating === 0}
                  onClick={async () => {
                    if (session && csatRating > 0) {
                      await fetch('/api/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messageId: `csat-${session.id}`, rating: csatRating, type: 'csat' }),
                      })
                    }
                    setCsatSubmitted(true)
                    setTimeout(() => { setShowCsat(false); setIsOpen(false) }, 1200)
                  }}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition-colors"
                >
                  {csatSubmitted ? '感谢！' : t[language].csatSubmit}
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          className="fixed bottom-24 right-6 w-80 sm:w-96 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col z-50 overflow-hidden"
          style={{ height: '520px' }}
        >
          {/* Header */}
          <div className="bg-blue-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="font-medium text-sm">{t[language].widgetTitle}</span>
              <span className="text-blue-200 text-xs">{t[language].online}</span>
            </div>
            <LanguageSwitcher current={language} onChange={handleLanguageChange} />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.map(msg => (
              <div key={msg.id}>
                <MessageBubble message={msg} language={language} />
                {/* Feedback buttons on bot messages only */}
                {msg.role === 'bot' && session?.status !== 'waiting' && (
                  <div className="flex gap-1 mb-2 ml-1">
                    {feedback[msg.id] === 'sent' ? (
                      <span className="text-[10px] text-slate-500">{t[language].feedbackThanks}</span>
                    ) : (
                      <>
                        <button
                          onClick={() => submitFeedback(msg.id, 1)}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                            feedback[msg.id] === 1
                              ? 'text-green-400'
                              : 'text-slate-600 hover:text-green-400'
                          }`}
                          title="Helpful"
                        >
                          👍
                        </button>
                        <button
                          onClick={() => submitFeedback(msg.id, -1)}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                            feedback[msg.id] === -1
                              ? 'text-red-400'
                              : 'text-slate-600 hover:text-red-400'
                          }`}
                          title="Not helpful"
                        >
                          👎
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isThinking && (
              <div className="flex items-center gap-1 px-3 py-2 mb-2">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
            {session?.status === 'waiting' && (
              <div className="text-center text-xs text-amber-400 py-2">
                <span className="animate-pulse">⏳</span> {t[language].waitingEstimate}
                {waitingElapsed > 0 && (
                  <span className="ml-1 text-slate-500">
                    （{Math.floor(waitingElapsed / 60)}:{String(waitingElapsed % 60).padStart(2, '0')}）
                  </span>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* High-anxiety fast lane */}
          {isHighAnxiety && session?.status === 'bot' && !isThinking && (
            <div className="px-3 py-2 flex-shrink-0 bg-rose-950/40 border-t border-rose-900/30 flex items-center justify-between gap-2">
              <span className="text-xs text-rose-300">{t[language].urgentTransfer}</span>
              <button
                onClick={() => triggerTransfer()}
                className="text-xs bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded-full transition-colors whitespace-nowrap"
              >
                {t[language].urgentTransferBtn}
              </button>
            </div>
          )}

          {/* Follow-up chips */}
          {followUps.length > 0 && session?.status === 'bot' && !isThinking && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 flex-shrink-0 border-t border-slate-800">
              {followUps.map((q, i) => (
                <button
                  key={i}
                  onClick={() => dispatch(q)}
                  className="text-xs bg-slate-800 hover:bg-blue-900/40 border border-slate-600 hover:border-blue-500 text-slate-300 hover:text-blue-300 px-2.5 py-1 rounded-full transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-slate-700 p-3 flex-shrink-0">
            {canTransfer && (
              <button
                onClick={() => triggerTransfer()}
                className="w-full mb-2 text-xs text-amber-400 border border-amber-700/50 rounded-lg py-1.5 hover:bg-amber-900/20 transition-colors"
              >
                👤 {t[language].transferBtn}
              </button>
            )}
            {session?.status === 'human' && (
              <button
                onClick={() => { setCsatRating(0); setCsatSubmitted(false); setShowCsat(true) }}
                className="w-full mb-2 text-xs text-slate-500 border border-slate-800 rounded-lg py-1.5 hover:bg-slate-800/50 transition-colors"
              >
                {t[language].endChat}
              </button>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={t[language].placeholder}
                disabled={session?.status === 'waiting'}
                className="flex-1 bg-slate-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || session?.status === 'waiting'}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {t[language].send}
              </button>
            </div>
            {session && (
              <div className="text-center text-[10px] text-slate-700 mt-1.5">
                {t[language].ticketId} #{session.id.slice(-6)}
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </>
  )
}
