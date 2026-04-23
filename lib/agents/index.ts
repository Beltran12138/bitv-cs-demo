import type { Language } from '../i18n'
import { BOT_RULES } from '../bot-rules'

// ─── Intent types ───────────────────────────────────────────────────────────

export type Intent =
  | 'fee'
  | 'withdraw'
  | 'kyc'
  | 'deposit'
  | 'security'
  | 'futures'
  | 'register'
  | 'api'
  | 'human'    // explicit escalation request
  | 'safety'   // off-platform solicitation detected
  | 'no_reply' // message doesn't warrant a response
  | 'unknown'

export type ProcessResult = {
  reply: string | null
  intent: Intent
  shouldTransfer: boolean
  traceId?: string
}

// ─── Classifier ─────────────────────────────────────────────────────────────

// Keywords that indicate the user wants a human agent
const HUMAN_KEYWORDS = [
  '人工', '转人工', '轉人工', '客服', '真人', 'human', 'agent', 'support', 'representative',
]

// Off-platform solicitation triggers safety warning
const SAFETY_PHRASES = [
  '微信', 'wechat', 'weixin', 'telegram', 'tg群', 'whatsapp', 'line',
  '手机号', '电话号码', 'phone number', 'phone no',
  '私聊', 'dm me', 'dm ', '私下', '站外', '场外', 'otc private',
]

// Pure punctuation / emoji — no reply needed
const NO_REPLY_RE = /^[\s\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}\p{P}]+$/u

// Intent → keyword map (mirrors BOT_RULES, drives future LLM routing)
const INTENT_KEYWORDS: Record<Exclude<Intent, 'human' | 'safety' | 'no_reply' | 'unknown'>, string[]> = {
  fee:      ['手续费', '费用', '费率', '手續費', '費率', 'fee', 'fees', 'commission', 'charge'],
  withdraw: ['提币', '提款', '出金', '提幣', 'withdraw', 'withdrawal'],
  kyc:      ['kyc', '实名', '认证', '身份验证', '認證', '身份驗證', 'verify', 'verification', 'identity'],
  deposit:  ['充值', '入金', '存款', '充幣', 'deposit', 'fund', 'top up', 'topup'],
  security: ['安全', '账户安全', '密码', '被盗', '安全性', '帳戶安全', '密碼', 'security', 'password', 'hacked', '2fa', '两步', '兩步'],
  futures:  ['合约', '期货', '永续', '杠杆', '合約', '期貨', '永續', '槓桿', 'futures', 'perpetual', 'leverage', 'contract'],
  register: ['注册', '开户', '注冊', '開戶', 'register', 'sign up', 'signup', 'create account'],
  api:      ['api', 'api key', 'api接口', '量化', 'quant', 'trading bot'],
}

export function classifyIntent(input: string): Intent {
  if (NO_REPLY_RE.test(input.trim())) return 'no_reply'

  const lower = input.toLowerCase()

  if (SAFETY_PHRASES.some(p => lower.includes(p.toLowerCase()))) return 'safety'
  if (HUMAN_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return 'human'

  // Score each intent by number of keyword hits; return highest score to handle
  // ambiguous inputs like "永续合约资金费率" (matches both fee and futures).
  let bestIntent: Intent = 'unknown'
  let bestScore = 0

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k.toLowerCase())).length
    if (score > bestScore) {
      bestScore = score
      bestIntent = intent as Intent
    }
  }

  return bestIntent
}

// ─── Safety replies ──────────────────────────────────────────────────────────

const SAFETY_REPLIES: Record<Language, string> = {
  'zh-CN': '温馨提示：请通过 bitV 官方渠道沟通，切勿将账户信息或资金转至平台外，谨防诈骗。',
  'zh-TW': '溫馨提示：請通過 bitV 官方渠道溝通，切勿將帳戶資訊或資金轉至平台外，謹防詐騙。',
  'en': 'Notice: Please use official bitV channels only. Never share account details or send funds off-platform. Stay safe from scams.',
}

// ─── Main entry point ────────────────────────────────────────────────────────
//
// Phase 1: keyword matching via BOT_RULES
// Phase 2: swap classifyIntent → LLM call, swap reply lookup → specialist agent LLM call
//          Prompt templates for each specialist live in lib/prompts/index.ts

export function processMessage(input: string, language: Language): ProcessResult {
  const intent = classifyIntent(input)

  if (intent === 'no_reply') {
    return { reply: null, intent, shouldTransfer: false }
  }

  if (intent === 'safety') {
    return { reply: SAFETY_REPLIES[language], intent, shouldTransfer: false }
  }

  if (intent === 'human') {
    return { reply: null, intent, shouldTransfer: true }
  }

  // Keyword → reply lookup (Phase 1)
  const lower = input.toLowerCase()
  for (const rule of BOT_RULES) {
    if (rule.keywords.some(k => lower.includes(k.toLowerCase()))) {
      return { reply: rule.answers[language], intent, shouldTransfer: false }
    }
  }

  return { reply: null, intent: 'unknown', shouldTransfer: false }
}
