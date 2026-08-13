export type Language = 'zh-CN' | 'zh-TW' | 'en'

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'zh-CN', label: '简体' },
  { code: 'zh-TW', label: '繁體' },
  { code: 'en', label: 'EN' },
]

type Translations = {
  greeting: string
  placeholder: string
  send: string
  transferBtn: string
  transferring: string
  agentJoined: (name: string) => string
  autoTransfer: string
  widgetTitle: string
  online: string
  agentPageTitle: string
  pendingLabel: string
  activeLabel: string
  acceptBtn: string
  replyPlaceholder: string
  waitingForAgent: string
  botLabel: string
  agentLabel: string
  noMatchOnce: string
  safetyWarning: string
  waitingTimeout: string
  feedbackThanks: string
  waitingEstimate: string
  urgentTransfer: string
  urgentTransferBtn: string
  ticketId: string
  csatTitle: string
  csatSubmit: string
  csatSkip: string
  endChat: string
}

export const t: Record<Language, Translations> = {
  'zh-CN': {
    greeting: '您好！我是 Acme 智能客服，请问有什么可以帮您？',
    placeholder: '输入您的问题...',
    send: '发送',
    transferBtn: '转人工服务',
    transferring: '正在为您转接人工客服，请稍候...',
    agentJoined: (name: string) => `客服 ${name} 已接入，请继续描述您的问题。`,
    autoTransfer: '抱歉，我无法解答您的问题，正在为您转接人工客服...',
    widgetTitle: 'Acme 客服',
    online: '在线',
    agentPageTitle: 'Acme 客服后台',
    pendingLabel: '待接入',
    activeLabel: '进行中',
    acceptBtn: '接入',
    replyPlaceholder: '输入回复...',
    waitingForAgent: '用户等待人工接入',
    botLabel: '机器人',
    agentLabel: '客服',
    noMatchOnce: '抱歉，我暂时无法解答这个问题，您可以点击"转人工"由专属客服为您服务。',
    safetyWarning: '温馨提示：请通过 Acme 官方渠道沟通，切勿将账户信息或资金转至平台外，谨防诈骗。',
    waitingTimeout: '当前客服繁忙，感谢您的耐心等待。您也可以留下问题，客服会尽快跟进。',
    feedbackThanks: '感谢您的反馈！',
    waitingEstimate: '正在为您匹配客服，预计等待 2-5 分钟',
    urgentTransfer: '⚡ 此类问题建议直接联系人工客服',
    urgentTransferBtn: '立即转接',
    ticketId: '工单',
    csatTitle: '感谢使用 Acme！请评价本次服务',
    csatSubmit: '提交',
    csatSkip: '跳过',
    endChat: '结束对话',
  },
  'zh-TW': {
    greeting: '您好！我是 Acme 智能客服，請問有什麼可以幫您？',
    placeholder: '輸入您的問題...',
    send: '發送',
    transferBtn: '轉人工服務',
    transferring: '正在為您轉接人工客服，請稍候...',
    agentJoined: (name: string) => `客服 ${name} 已接入，請繼續描述您的問題。`,
    autoTransfer: '抱歉，我無法解答您的問題，正在為您轉接人工客服...',
    widgetTitle: 'Acme 客服',
    online: '線上',
    agentPageTitle: 'Acme 客服後台',
    pendingLabel: '待接入',
    activeLabel: '進行中',
    acceptBtn: '接入',
    replyPlaceholder: '輸入回覆...',
    waitingForAgent: '用戶等待人工接入',
    botLabel: '機器人',
    agentLabel: '客服',
    noMatchOnce: '抱歉，我暫時無法解答這個問題，您可以點擊「轉人工」由專屬客服為您服務。',
    safetyWarning: '溫馨提示：請通過 Acme 官方渠道溝通，切勿將帳戶資訊或資金轉至平台外，謹防詐騙。',
    waitingTimeout: '當前客服繁忙，感謝您的耐心等待。您也可以留下問題，客服會盡快跟進。',
    feedbackThanks: '感謝您的反饋！',
    waitingEstimate: '正在為您匹配客服，預計等待 2-5 分鐘',
    urgentTransfer: '⚡ 此類問題建議直接聯繫人工客服',
    urgentTransferBtn: '立即轉接',
    ticketId: '工單',
    csatTitle: '感謝使用 Acme！請評價本次服務',
    csatSubmit: '提交',
    csatSkip: '跳過',
    endChat: '結束對話',
  },
  'en': {
    greeting: "Hi! I'm Acme's virtual assistant. How can I help you today?",
    placeholder: 'Type your question...',
    send: 'Send',
    transferBtn: 'Talk to a human',
    transferring: 'Connecting you to a support agent, please hold...',
    agentJoined: (name: string) => `Agent ${name} has joined. Please describe your issue.`,
    autoTransfer: "I'm unable to help with that. Connecting you to a support agent...",
    widgetTitle: 'Acme Support',
    online: 'Online',
    agentPageTitle: 'Acme Agent Dashboard',
    pendingLabel: 'Pending',
    activeLabel: 'Active',
    acceptBtn: 'Accept',
    replyPlaceholder: 'Type a reply...',
    waitingForAgent: 'User waiting for agent',
    botLabel: 'Bot',
    agentLabel: 'Agent',
    noMatchOnce: "Sorry, I can't answer that. You can click 'Talk to a human' for personalized support.",
    safetyWarning: 'Notice: Please use official Acme channels only. Never share account details or send funds off-platform. Stay safe from scams.',
    waitingTimeout: 'Our agents are currently busy. Thank you for your patience — someone will be with you shortly.',
    feedbackThanks: 'Thanks for your feedback!',
    waitingEstimate: 'Connecting you to a support agent. Estimated wait: 2-5 min',
    urgentTransfer: '⚡ For this issue, we recommend speaking with a human agent',
    urgentTransferBtn: 'Connect Now',
    ticketId: 'Ticket',
    csatTitle: 'Thanks for using Acme! Please rate your experience',
    csatSubmit: 'Submit',
    csatSkip: 'Skip',
    endChat: 'End Chat',
  },
}
