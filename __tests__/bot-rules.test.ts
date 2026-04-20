import { matchBot } from '../lib/bot-rules'

describe('matchBot', () => {
  test('匹配手续费关键词（中文）返回 zh-CN 答案', () => {
    const result = matchBot('请问手续费是多少', 'zh-CN')
    expect(result).not.toBeNull()
    expect(result).toContain('0.1%')
  })

  test('匹配 fee 关键词（英文）返回 en 答案', () => {
    const result = matchBot('what are the fees?', 'en')
    expect(result).not.toBeNull()
    expect(result).toContain('0.1%')
  })

  test('匹配提币关键词（繁中）返回 zh-TW 答案', () => {
    const result = matchBot('我想提幣', 'zh-TW')
    expect(result).not.toBeNull()
    expect(result).toContain('提幣')
  })

  test('未匹配任何规则返回 null', () => {
    const result = matchBot('今天天气怎么样', 'zh-CN')
    expect(result).toBeNull()
  })

  test('大小写不敏感（英文关键词）', () => {
    const result = matchBot('HOW TO WITHDRAW?', 'en')
    expect(result).not.toBeNull()
  })

  test('匹配 KYC 关键词', () => {
    const result = matchBot('kyc认证怎么做', 'zh-CN')
    expect(result).not.toBeNull()
    expect(result).toContain('KYC')
  })
})
