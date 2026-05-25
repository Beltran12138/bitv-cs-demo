// Lark interactive card builders for CS handoff flow (all schema 2.0)
// Card schema docs: https://open.feishu.cn/document/feishu-cards/card-json-v2-structure

const INTENT_LABEL: Record<string, string> = {
  fee: '💰 手续费', withdraw: '💸 提币', kyc: '🪪 KYC', deposit: '⬇️ 充值',
  security: '🔐 安全', futures: '📈 合约', register: '✍️ 注册', api: '🔌 API',
  order: '📋 订单', account: '👤 账户', compliance: '⚖️ 合规',
  human: '🙋 转人工', safety: '⚠️ 安全警示', unknown: '❓ 未分类',
}

const STATUS_LABEL: Record<string, string> = {
  bot: '🤖 机器人服务中',
  waiting: '⏳ 等待客服',
  human: '👤 人工服务中',
  closed: '🔒 已关单',
}

type BtnValue = Record<string, unknown>

function btn(opts: {
  id: string
  text: string
  type?: 'primary' | 'default' | 'danger'
  value: BtnValue
  formSubmit?: boolean
  name?: string
}): object {
  const b: Record<string, unknown> = {
    tag: 'button',
    element_id: opts.id,
    text: { tag: 'plain_text', content: opts.text },
    type: opts.type ?? 'default',
    behaviors: [{ type: 'callback', value: opts.value }],
  }
  if (opts.formSubmit) {
    b.form_action_type = 'submit'
    b.name = opts.name ?? opts.id
  }
  return b
}

export type HandoffCardInput = {
  sessionId: string
  userMessage: string
  intent: string
  language: 'zh-CN' | 'zh-TW' | 'en'
  baseUrl?: string
}

export function buildHandoffCard(input: HandoffCardInput): object {
  const intentLabel = INTENT_LABEL[input.intent] ?? input.intent
  const shortSid = input.sessionId.slice(0, 8)
  const v = { sessionId: input.sessionId }

  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `🎫 客户工单 #${shortSid}` },
      template: 'blue',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**会话**: \`${shortSid}\` · **意图**: ${intentLabel} · **语言**: ${input.language} · **状态**: ${STATUS_LABEL.waiting}`,
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: `**📨 用户消息**\n> ${escapeMd(input.userMessage)}`,
        },
        { tag: 'hr' },
        btn({ id: 'open_reply', text: '📤 回复', type: 'primary', value: { ...v, action: 'open_reply' } }),
        btn({ id: 'accept', text: '✋ 接单', value: { ...v, action: 'accept' } }),
        btn({ id: 'lookup', text: '📋 查档', value: { ...v, action: 'lookup' } }),
        btn({ id: 'close', text: '🔒 关单', type: 'danger', value: { ...v, action: 'close' } }),
      ],
    },
  }
}

export type ReplyFormCardInput = {
  sessionId: string
  userMessage: string
  intent: string
}

export function buildReplyFormCard(input: ReplyFormCardInput): object {
  const intentLabel = INTENT_LABEL[input.intent] ?? input.intent
  const shortSid = input.sessionId.slice(0, 8)
  const v = { sessionId: input.sessionId, userMessage: input.userMessage, intent: input.intent }

  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `📤 回复客户 #${shortSid}` },
      template: 'green',
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `**意图**: ${intentLabel}\n\n**用户消息**:\n> ${escapeMd(input.userMessage)}`,
        },
        { tag: 'hr' },
        {
          tag: 'form',
          name: 'reply_form',
          elements: [
            {
              tag: 'input',
              element_id: 'reply_input',
              name: 'reply_text',
              placeholder: { tag: 'plain_text', content: '在此输入对客户的回复...' },
              max_length: 1000,
              input_type: 'multiline_text',
              rows: 3,
              required: true,
              label: { tag: 'plain_text', content: '✏️ 回复内容' },
              label_position: 'top',
            },
            btn({
              id: 'send_btn', text: '✅ 发送回复', type: 'primary',
              value: { ...v, action: 'send_reply' }, formSubmit: true, name: 'send_btn',
            }),
          ],
        },
        btn({ id: 'cancel_btn', text: '↩️ 取消', value: { ...v, action: 'cancel_reply' } }),
      ],
    },
  }
}

export type StatusCardInput = {
  sessionId: string
  userMessage: string
  intent: string
  status: 'human' | 'closed' | 'replied'
  agentName?: string
  lastReply?: string
}

export function buildStatusCard(input: StatusCardInput): object {
  const intentLabel = INTENT_LABEL[input.intent] ?? input.intent
  const shortSid = input.sessionId.slice(0, 8)
  const v = { sessionId: input.sessionId }

  let statusText = ''
  let template = 'blue'
  switch (input.status) {
    case 'human':
      statusText = `${STATUS_LABEL.human}（${input.agentName ?? '客服'}）`
      template = 'turquoise'
      break
    case 'closed':
      statusText = `${STATUS_LABEL.closed}（${input.agentName ?? '客服'}）`
      template = 'grey'
      break
    case 'replied':
      statusText = `✅ 已回复客户`
      template = 'green'
      break
  }

  const elements: object[] = [
    {
      tag: 'markdown',
      content: `**会话**: \`${shortSid}\` · **意图**: ${intentLabel}`,
    },
    { tag: 'hr' },
    {
      tag: 'markdown',
      content: `**📨 用户消息**\n> ${escapeMd(input.userMessage)}`,
    },
  ]

  if (input.lastReply) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'markdown',
      content: `**📤 客服回复**\n${escapeMd(input.lastReply)}`,
    })
  }

  elements.push({ tag: 'hr' })
  elements.push({
    tag: 'markdown',
    content: `**🔄 状态**: ${statusText}`,
  })

  if (input.status === 'replied' || input.status === 'human') {
    elements.push(btn({ id: 'open_reply2', text: '📤 再次回复', type: 'primary', value: { ...v, action: 'open_reply' } }))
    elements.push(btn({ id: 'lookup2', text: '📋 查档', value: { ...v, action: 'lookup' } }))
    elements.push(btn({ id: 'close2', text: '🔒 关单', type: 'danger', value: { ...v, action: 'close' } }))
  }

  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `🎫 客户工单 #${shortSid}` },
      template,
    },
    body: { elements },
  }
}

export type LookupCardInput = {
  sessionId: string
  userMessage: string
  intent: string
  profile: {
    user_anon: string
    intent: string
    status: string
    start_at: string
    last_msg_at: string
    agent_user?: string
    messages_count: number
    notes?: string
  }
}

export function buildLookupCard(input: LookupCardInput): object {
  const shortSid = input.sessionId.slice(0, 8)
  const p = input.profile
  const v = { sessionId: input.sessionId, userMessage: input.userMessage, intent: input.intent }

  const lines = [
    `**用户**: ${p.user_anon}`,
    `**当前意图**: ${INTENT_LABEL[p.intent] ?? p.intent}`,
    `**状态**: ${STATUS_LABEL[p.status] ?? p.status}`,
    `**消息数**: ${p.messages_count}`,
    `**开始**: ${p.start_at}`,
    `**最近**: ${p.last_msg_at}`,
  ]
  if (p.agent_user) lines.push(`**接单客服**: ${p.agent_user}`)
  if (p.notes) lines.push(`**备注**: ${p.notes}`)

  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `📋 客户档案 #${shortSid}` },
      template: 'purple',
    },
    body: {
      elements: [
        { tag: 'markdown', content: lines.join('\n') },
        { tag: 'hr' },
        btn({ id: 'back_to_handoff', text: '↩️ 返回工单', value: { ...v, action: 'back_to_handoff' } }),
      ],
    },
  }
}

function escapeMd(s: string): string {
  const trimmed = s.length > 500 ? s.slice(0, 500) + '…' : s
  return trimmed.replace(/\\/g, '\\\\').replace(/\n/g, '\n> ')
}
