import { classifyIntent } from '../index'

describe('classifyIntent', () => {
  // no_reply
  test('emoji only → no_reply', () => expect(classifyIntent('😂')).toBe('no_reply'))
  test('punctuation only → no_reply', () => expect(classifyIntent('...')).toBe('no_reply'))
  test('mixed emoji punctuation → no_reply', () => expect(classifyIntent('👍!')).toBe('no_reply'))

  // safety
  test('wechat mention → safety', () => expect(classifyIntent('加我微信聊')).toBe('safety'))
  test('telegram → safety', () => expect(classifyIntent('join our telegram group')).toBe('safety'))
  test('OTC private → safety', () => expect(classifyIntent('otc private deal')).toBe('safety'))
  test('phone number request → safety', () => expect(classifyIntent('send me your phone number')).toBe('safety'))

  // human escalation
  test('转人工 → human', () => expect(classifyIntent('请转人工')).toBe('human'))
  test('真人 → human', () => expect(classifyIntent('我要真人客服')).toBe('human'))
  test('english agent request → human', () => expect(classifyIntent('I need a human agent')).toBe('human'))
  test('representative → human', () => expect(classifyIntent('speak to a representative')).toBe('human'))

  // fee
  test('手续费 → fee', () => expect(classifyIntent('手续费多少')).toBe('fee'))
  test('費率 → fee', () => expect(classifyIntent('交易費率是多少')).toBe('fee'))
  test('commission → fee', () => expect(classifyIntent('what is the trading commission')).toBe('fee'))
  test('fees → fee', () => expect(classifyIntent('how much are the fees')).toBe('fee'))

  // withdraw
  test('提币 → withdraw', () => expect(classifyIntent('怎么提币')).toBe('withdraw'))
  test('withdrawal → withdraw', () => expect(classifyIntent('how do I make a withdrawal')).toBe('withdraw'))
  test('出金 → withdraw', () => expect(classifyIntent('出金要多久')).toBe('withdraw'))

  // kyc
  test('kyc lowercase → kyc', () => expect(classifyIntent('kyc怎么做')).toBe('kyc'))
  test('实名 → kyc', () => expect(classifyIntent('实名认证流程')).toBe('kyc'))
  test('verification → kyc', () => expect(classifyIntent('how to complete verification')).toBe('kyc'))

  // deposit
  test('充值 → deposit', () => expect(classifyIntent('如何充值')).toBe('deposit'))
  test('deposit english → deposit', () => expect(classifyIntent('how to deposit USDT')).toBe('deposit'))
  test('入金 → deposit', () => expect(classifyIntent('入金方式有哪些')).toBe('deposit'))

  // security
  test('账户安全 → security', () => expect(classifyIntent('账户安全问题')).toBe('security'))
  test('2fa → security', () => expect(classifyIntent('how to set up 2fa')).toBe('security'))
  test('hacked → security', () => expect(classifyIntent('my account got hacked')).toBe('security'))

  // futures
  test('合约 → futures', () => expect(classifyIntent('合约怎么开仓')).toBe('futures'))
  test('leverage → futures', () => expect(classifyIntent('what is max leverage')).toBe('futures'))
  test('永续 → futures', () => expect(classifyIntent('永续合约资金费率')).toBe('futures'))

  // register
  test('注册 → register', () => expect(classifyIntent('怎么注册账号')).toBe('register'))
  test('sign up → register', () => expect(classifyIntent('how do I sign up')).toBe('register'))
  test('开户 → register', () => expect(classifyIntent('开户需要什么')).toBe('register'))

  // api
  test('api → api', () => expect(classifyIntent('api接口怎么用')).toBe('api'))
  test('trading bot → api', () => expect(classifyIntent('set up a trading bot')).toBe('api'))
  test('quant → api', () => expect(classifyIntent('量化交易接口')).toBe('api'))

  // unknown
  test('random text → unknown', () => expect(classifyIntent('what is the weather today')).toBe('unknown'))
  test('empty-ish text → unknown', () => expect(classifyIntent('hello')).toBe('unknown'))
})
