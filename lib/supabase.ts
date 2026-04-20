import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Session = {
  id: string
  status: 'bot' | 'waiting' | 'human'
  language: 'zh-CN' | 'zh-TW' | 'en'
  created_at: string
}

export type Message = {
  id: string
  session_id: string
  role: 'user' | 'bot' | 'agent'
  content: string
  created_at: string
}
