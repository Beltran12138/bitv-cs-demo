'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, type Message, type Session } from '@/lib/supabase'
import { t, type Language } from '@/lib/i18n'
import type { ProcessResult } from '@/lib/agents'
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
  // Langfuse: traceId waiting to be bound to the next bot message from Realtime
  const pendingTraceIdRef = useRef<string | null>(null)
  // messageId → Langfuse traceId
  const traceIdMapRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (isOpen && !session) {
      initSession()
    }
  }, [isOpen, session])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (session?.status === 'waiting') {
      waitingTimerRef.current = setTimeout(async () => {
        if (sessionRef.current?.status === 'waiting') {
          await supabase.from('messages').insert({
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

    supabase
      .from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT)
      .then(({ data }) => {
        if (data) setMessages((data as Message[]).reverse())
      })

    const msgChannel = supabase
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

    const sessionChannel = supabase
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
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(sessionChannel)
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

    await supabase.from('messages').insert({
      session_id: newSession.id,
      role: 'bot',
      content: t[language].greeting,
    })
  }

  async function handleSend() {
    if (!input.trim() || !session) return
    const text = input.trim()
    setInput('')

    await supabase.from('messages').insert({
      session_id: session.id,
      role: 'user',
      content: text,
    })

    if (session.status === 'human') return

    setIsThinking(true)
    let result: ProcessResult
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language,
          history: messages.slice(-10).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        }),
      })
      result = await res.json()
      if (result.traceId) pendingTraceIdRef.current = result.traceId
    } finally {
      setIsThinking(false)
    }

    if (result.intent === 'no_reply') return

    if (result.shouldTransfer) {
      noMatchCountRef.current = 0
      await triggerTransfer(t[language].autoTransfer)
      return
    }

    if (result.reply) {
      noMatchCountRef.current = 0
      await supabase.from('messages').insert({
        session_id: session.id,
        role: 'bot',
        content: result.reply,
      })
    } else {
      noMatchCountRef.current += 1

      if (noMatchCountRef.current >= 3) {
        noMatchCountRef.current = 0
        await triggerTransfer(t[language].autoTransfer)
      } else {
        await supabase.from('messages').insert({
          session_id: session.id,
          role: 'bot',
          content: t[language].noMatchOnce,
        })
      }
    }
  }

  async function triggerTransfer(message?: string) {
    if (!sessionRef.current || sessionRef.current.status !== 'bot') return
    const currentSession = sessionRef.current
    setIsTransferring(true)

    await supabase.from('messages').insert({
      session_id: currentSession.id,
      role: 'bot',
      content: message || t[language].transferring,
    })

    await supabase
      .from('sessions')
      .update({ status: 'waiting' })
      .eq('id', currentSession.id)
  }

  async function handleLanguageChange(lang: Language) {
    setLanguage(lang)
    if (session) {
      await supabase.from('sessions').update({ language: lang }).eq('id', session.id)
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
            {isTransferring && session?.status === 'waiting' && (
              <div className="text-center text-xs text-amber-400 py-2 animate-pulse">
                ⏳ {t[language].waitingForAgent}...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

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
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={t[language].placeholder}
                disabled={session?.status === 'waiting'}
                className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || session?.status === 'waiting'}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {t[language].send}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
