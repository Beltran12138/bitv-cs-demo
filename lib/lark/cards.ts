// Lark interactive card builders for CS handoff flow
// Card schema docs: https://open.feishu.cn/document/common-capabilities/message-card

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

export type HandoffCardInput = {
  sessionId: string
  userMessage: string
  intent: string
  language: 'zh-CN' | 'zh-TW' | 'en'
  baseUrl?: string  // 用户 chat URL，方便客服查上下文
}

export function buildHandoffCard(input: HandoffCardInput): object {
  const intentLabel = INTENT_LABEL[input.intent] ?? input.intent
  const shortSid = input.sessionId.slice(0, 8)

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `🎫 客户工单 #${shortSid}` },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**会话**\n${shortSid}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**意图**\n${intentLabel}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**语言**\n${input.language}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**状态**\n${STATUS_LABEL.waiting}` } },
        ],
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**📨 用户消息**\n> ${escapeMd(input.userMessage)}` },
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📤 回复' },
            type: 'primary',
            value: { action: 'open_reply', sessionId: input.sessionId },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✋ 接单' },
            type: 'default',
            value: { action: 'accept', sessionId: input.sessionId },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📋 查档' },
            type: 'default',
            value: { action: 'lookup', sessionId: input.sessionId },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔒 关单' },
            type: 'danger',
            value: { action: 'close', sessionId: input.sessionId },
          },
        ],
      },
      ...(input.baseUrl ? [{
        tag: 'note',
        elements: [{ tag: 'plain_text', content: `用户会话链接: ${input.baseUrl}` }],
      }] : []),
    ],
  }
}

// 「回复」按钮点击后展开 input form
export type ReplyFormCardInput = {
  sessionId: string
  userMessage: string
  intent: string
}

export function buildReplyFormCard(input: ReplyFormCardInput): object {
  const intentLabel = INTENT_LABEL[input.intent] ?? input.intent
  const shortSid = input.sessionId.slice(0, 8)

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `📤 回复客户 #${shortSid}` },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**意图**: ${intentLabel} · **用户消息**:\n> ${escapeMd(input.userMessage)}` },
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '**✏️ 输入回复内容**' },
      },
      {
        tag: 'input',
        name: 'reply_text',
        placeholder: { tag: 'plain_text', content: '在此输入对客户的回复...' },
        max_length: 1000,
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ 发送回复' },
            type: 'primary',
            value: { action: 'send_reply', sessionId: input.sessionId, userMessage: input.userMessage, intent: input.intent },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '↩️ 取消' },
            type: 'default',
            value: { action: 'cancel_reply', sessionId: input.sessionId, userMessage: input.userMessage, intent: input.intent },
          },
        ],
      },
    ],
  }
}

// 状态更新卡片（接单/关单/已回复后展示）
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
      tag: 'div',
      fields: [
        { is_short: true, text: { tag: 'lark_md', content: `**会话**\n${shortSid}` } },
        { is_short: true, text: { tag: 'lark_md', content: `**意图**\n${intentLabel}` } },
      ],
    },
    { tag: 'hr' },
    {
      tag: 'div',
      text: { tag: 'lark_md', content: `**📨 用户消息**\n> ${escapeMd(input.userMessage)}` },
    },
  ]

  if (input.lastReply) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**📤 客服回复**\n${escapeMd(input.lastReply)}` },
    })
  }

  elements.push({ tag: 'hr' })
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `**🔄 状态**: ${statusText}` },
  })

  // 已回复状态后允许再次回复或关单
  if (input.status === 'replied' || input.status === 'human') {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '📤 再次回复' },
          type: 'primary',
          value: { action: 'open_reply', sessionId: input.sessionId },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '📋 查档' },
          type: 'default',
          value: { action: 'lookup', sessionId: input.sessionId },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '🔒 关单' },
          type: 'danger',
          value: { action: 'close', sessionId: input.sessionId },
        },
      ],
    })
  }

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `🎫 客户工单 #${shortSid}` },
      template,
    },
    elements,
  }
}

// 查档结果卡片
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

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `📋 客户档案 #${shortSid}` },
      template: 'purple',
    },
    elements: [
      {
        tag: 'div',
        fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**用户**\n${p.user_anon}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**当前意图**\n${INTENT_LABEL[p.intent] ?? p.intent}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**状态**\n${STATUS_LABEL[p.status] ?? p.status}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**消息数**\n${p.messages_count}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**开始**\n${p.start_at}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**最近**\n${p.last_msg_at}` } },
          ...(p.agent_user ? [{ is_short: false, text: { tag: 'lark_md', content: `**接单客服**: ${p.agent_user}` } }] : []),
          ...(p.notes ? [{ is_short: false, text: { tag: 'lark_md', content: `**备注**: ${p.notes}` } }] : []),
        ],
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '↩️ 返回工单' },
            type: 'default',
            value: { action: 'back_to_handoff', sessionId: input.sessionId, userMessage: input.userMessage, intent: input.intent },
          },
        ],
      },
    ],
  }
}

function escapeMd(s: string): string {
  // 限制长度避免卡片过长，escape lark_md 控制符
  const trimmed = s.length > 500 ? s.slice(0, 500) + '…' : s
  return trimmed.replace(/\\/g, '\\\\').replace(/\n/g, '\n> ')
}
