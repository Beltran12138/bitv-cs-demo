import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('supabaseUrl and supabaseAnonKey are required')
    _supabase = createClient(url, key)
  }
  return _supabase
}

// Safe no-ops used when env vars are absent (prevents page crashes in unconfigured environments)
const NOOP_SUBSCRIPTION = { unsubscribe: () => {} }
const NOOP_CHANNEL = {
  on: () => NOOP_CHANNEL,
  subscribe: () => NOOP_SUBSCRIPTION,
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    let client: SupabaseClient
    try {
      client = getSupabase()
    } catch {
      // Env vars not configured — return safe no-ops so pages don't crash
      if (prop === 'channel') return () => NOOP_CHANNEL
      if (prop === 'removeChannel') return () => Promise.resolve()
      return () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } })
    }
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
})

export type Session = {
  id: string
  status: 'bot' | 'waiting' | 'human'
  language: 'zh-CN' | 'zh-TW' | 'en'
  intent?: string
  created_at: string
}

export type Message = {
  id: string
  session_id: string
  role: 'user' | 'bot' | 'agent'
  content: string
  created_at: string
}
