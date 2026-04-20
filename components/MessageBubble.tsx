import type { Message } from '@/lib/supabase'
import type { Language } from '@/lib/i18n'
import { t } from '@/lib/i18n'

interface Props {
  message: Message
  language: Language
}

export default function MessageBubble({ message, language }: Props) {
  const isUser = message.role === 'user'
  const isBot = message.role === 'bot'
  const isAgent = message.role === 'agent'

  return (
    <div className={`flex gap-2 mb-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
          isBot ? 'bg-blue-600' : 'bg-amber-500'
        }`}>
          {isBot ? '🤖' : '👤'}
        </div>
      )}

      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {!isUser && (
          <span className="text-[10px] text-slate-500 px-1">
            {isBot ? t[language].botLabel : t[language].agentLabel}
          </span>
        )}

        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : isAgent
            ? 'bg-amber-900/40 text-amber-100 border border-amber-700/50 rounded-tl-sm'
            : 'bg-slate-800 text-slate-200 rounded-tl-sm'
        }`}>
          {message.content}
        </div>
      </div>
    </div>
  )
}
