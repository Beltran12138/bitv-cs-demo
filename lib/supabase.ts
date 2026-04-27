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

/** @deprecated use getSupabase() */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
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
