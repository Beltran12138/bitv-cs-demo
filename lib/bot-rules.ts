import type { Language } from './i18n'

interface BotRule {
  keywords: string[]
  answers: Record<Language, string>
}

export const BOT_RULES: BotRule[] = [
  {
    keywords: ['手续费', '费用', '费率', '手續費', '費率', 'fee', 'fees', 'commission', 'charge'],
    answers: {
      'zh-CN': 'bitV 现货交易手续费为 0.1%，持有 BTV 可享最低 0.05% 优惠费率。提币手续费根据币种不同，具体请查看提币页面。',
      'zh-TW': 'bitV 現貨交易手續費為 0.1%，持有 BTV 可享最低 0.05% 優惠費率。提幣手續費根據幣種不同，具體請查看提幣頁面。',
      'en': 'bitV charges 0.1% for spot trading. BTV holders enjoy rates as low as 0.05%. Withdrawal fees vary by asset — check the withdrawal page for details.',
    },
  },
  {
    keywords: ['提币', '提款', '出金', '提幣', 'withdraw', 'withdrawal'],
    answers: {
      'zh-CN': '提币步骤：登录 → 资金 → 提币，选择币种和网络，填写地址和数量。通常 1-2 个工作日到账，旺季可能延迟。',
      'zh-TW': '提幣步驟：登入 → 資金 → 提幣，選擇幣種和網路，填寫地址和數量。通常 1-2 個工作日到帳，旺季可能延遲。',
      'en': 'To withdraw: Log in → Funds → Withdraw. Select asset and network, enter address and amount. Processing takes 1–2 business days.',
    },
  },
  {
    keywords: ['kyc', '实名', '认证', '身份验证', '認證', '身份驗證', 'verify', 'verification', 'identity'],
    answers: {
      'zh-CN': 'KYC 认证需要：有效身份证件（护照/身份证）+ 手持证件自拍照。通常 1 个工作日内完成，完成后可解锁更高提币限额。',
      'zh-TW': 'KYC 認證需要：有效身份證件（護照/身分證）+ 手持證件自拍照。通常 1 個工作日內完成，完成後可解鎖更高提幣限額。',
      'en': 'KYC requires a valid ID (passport or national ID) and a selfie holding your ID. Verification completes within 1 business day and unlocks higher withdrawal limits.',
    },
  },
  {
    keywords: ['充值', '入金', '存款', '充幣', 'deposit', 'fund', 'top up', 'topup'],
    answers: {
      'zh-CN': '充值方式：加密货币充值（复制您的充值地址）或法币购买。请务必选择正确网络，转账前仔细核对地址，转错不可找回。',
      'zh-TW': '充值方式：加密貨幣充值（複製您的充值地址）或法幣購買。請務必選擇正確網路，轉帳前仔細核對地址，轉錯不可找回。',
      'en': 'Deposit by sending crypto to your deposit address, or buy with fiat. Always verify the network and address before sending — transfers to wrong addresses cannot be reversed.',
    },
  },
  {
    keywords: ['安全', '账户安全', '密码', '被盗', '安全性', '帳戶安全', '密碼', 'security', 'password', 'hacked', '2fa', '两步', '兩步'],
    answers: {
      'zh-CN': '建议开启双重验证（2FA）保护账户安全。如发现账户异常，立即修改密码并联系我们。bitV 采用冷热钱包分离存储，99% 资金存于冷钱包。',
      'zh-TW': '建議開啟雙重驗證（2FA）保護帳戶安全。如發現帳戶異常，立即修改密碼並聯繫我們。bitV 採用冷熱錢包分離儲存，99% 資金存於冷錢包。',
      'en': 'We recommend enabling 2FA. If you notice suspicious activity, change your password immediately and contact us. bitV uses cold storage for 99% of funds.',
    },
  },
  {
    keywords: ['合约', '期货', '永续', '杠杆', '合約', '期貨', '永續', '槓桿', 'futures', 'perpetual', 'leverage', 'contract'],
    answers: {
      'zh-CN': 'bitV 提供永续合约，最高杠杆 100x。建议新用户从低杠杆开始并设置止损。合约手续费：Maker 0.02%，Taker 0.05%。',
      'zh-TW': 'bitV 提供永續合約，最高槓桿 100x。建議新用戶從低槓桿開始並設定止損。合約手續費：Maker 0.02%，Taker 0.05%。',
      'en': 'bitV offers perpetual futures with up to 100x leverage. New users should start low and always set stop-losses. Fees: Maker 0.02%, Taker 0.05%.',
    },
  },
  {
    keywords: ['注册', '开户', '注冊', '開戶', 'register', 'sign up', 'signup', 'create account'],
    answers: {
      'zh-CN': '注册步骤：点击官网"注册" → 填写邮箱密码 → 验证邮箱 → 完成 KYC 即可交易。全程约 5 分钟。',
      'zh-TW': '註冊步驟：點擊官網「註冊」→ 填寫電子郵件密碼 → 驗證電子郵件 → 完成 KYC 即可交易。全程約 5 分鐘。',
      'en': 'To register: Click "Sign Up" → Enter email and password → Verify email → Complete KYC. The whole process takes about 5 minutes.',
    },
  },
  {
    keywords: ['api', 'api key', 'api接口', '量化', 'quant', 'trading bot', 'bot'],
    answers: {
      'zh-CN': 'bitV 提供 REST API 和 WebSocket API。在账户设置中创建 API Key，可设置只读或交易权限。详细文档请访问 docs.bitv.com。',
      'zh-TW': 'bitV 提供 REST API 和 WebSocket API。在帳戶設定中建立 API Key，可設定唯讀或交易權限。詳細文件請訪問 docs.bitv.com。',
      'en': 'bitV offers REST and WebSocket APIs. Create an API key in Account Settings with read-only or trading permissions. See docs.bitv.com for full documentation.',
    },
  },
]

/**
 * 匹配用户输入，返回对应语言的回答。
 * 无匹配时返回 null（调用方负责处理转人工逻辑）。
 */
export function matchBot(input: string, language: Language): string | null {
  const lower = input.toLowerCase()
  for (const rule of BOT_RULES) {
    if (rule.keywords.some(k => lower.includes(k.toLowerCase()))) {
      return rule.answers[language]
    }
  }
  return null
}
