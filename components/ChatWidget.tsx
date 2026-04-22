'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase, type Message, type Session } from '@/lib/supabase'
import { t, type Language } from '@/lib/i18n'
import { processMessage } from '@/lib/agents'
import MessageBubble from './MessageBubble'
import LanguageSwitcher from './LanguageSwitcher'

const WAITING_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open chat → init session
  useEffect(() => {
    if (isOpen && !session) {
      initSession()
    }
  }, [isOpen, session])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Waiting timeout: insert reminder if no agent joins within 3 minutes
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

  // Subscribe to Realtime (messages + session status)
  useEffect(() => {
    if (!session) return

    // Load existing messages (history truncated to last N)
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

    const result = processMessage(text, language)

    // Silence: pure emoji / punctuation
    if (result.intent === 'no_reply') return

    // Explicit transfer request
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
              <MessageBubble key={msg.id} message={msg} language={language} />
            ))}
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
