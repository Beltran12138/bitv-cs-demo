# bitV 客服机器人 Demo — 设计文档

**日期：** 2026-04-20  
**状态：** 已批准  
**受众：** 内部演示（产品团队 / 领导层）

---

## 1. 目标

搭建一个可分享 URL 的客服机器人 Demo，演示完整流程：

1. 用户在聊天窗口与 AI 机器人对话（关键词匹配）
2. 机器人无法回答时，用户点击"转人工"
3. 客服人员在另一个标签页实时接管对话
4. 全程用户界面保持不变，无感知切换

Demo 完成后可逐步升级为生产系统，无需重写。

---

## 2. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端框架 | Next.js 14 (App Router) | 两个页面：/chat 和 /agent |
| 实时通信 | Supabase Realtime | WebSocket 托管，零服务器 |
| 数据存储 | Supabase PostgreSQL | 消息历史、会话状态 |
| 部署 | Vercel | 一键部署，公开 URL |
| 语言 | TypeScript | 全栈 |
| 样式 | Tailwind CSS | 深色主题，贴近 bitV 风格 |

---

## 3. 页面设计

### 3.1 `/chat` — 用户视角

- 模拟 bitV 官网背景（深色主题，蓝色品牌色）
- 右下角悬浮"在线客服"按钮，点击展开聊天窗口
- 聊天窗口顶部有三语切换：**简体中文 / 繁體中文 / English**
- 机器人自动回复（关键词匹配）
- 连续 3 次无法匹配，或用户点击"转人工"按钮 → 触发转人工流程
- 转人工后聊天窗口出现"客服已接入"提示，界面不变，继续在同一窗口对话

### 3.2 `/agent` — 客服视角（Demo 阶段无鉴权，知道 URL 即可访问；生产阶段需加登录）

- 左侧：会话列表（待接入 / 进行中）
- 转人工请求以黄色高亮显示，有"接入"按钮
- 右侧：选中会话的完整对话历史（含机器人对话记录）
- 输入框实时发送，消息立即出现在用户端 `/chat` 页面

---

## 4. 数据库结构（Supabase）

### `sessions` 表
```sql
id          uuid primary key
status      text  -- 'bot' | 'waiting' | 'human'
language    text  -- 'zh-CN' | 'zh-TW' | 'en'
created_at  timestamp
```

### `messages` 表
```sql
id          uuid primary key
session_id  uuid references sessions(id)
role        text  -- 'user' | 'bot' | 'agent'
content     text
created_at  timestamp
```

Supabase Realtime 监听 `messages` 表的 INSERT 事件，双端实时同步。

---

## 5. 机器人关键词配置（`lib/bot-rules.ts`）

初始预设 8 个问答。匹配逻辑：将用户输入统一转为小写后做 `includes` 子串匹配，关键词数组包含三语变体，语言无关（用户用任何语言触发均可），回答语言跟随 session.language。

| 关键词（任意语言） | 回答主题 |
|---|---|
| 手续费 / fee / 費用 | 交易手续费说明 |
| 提币 / withdraw | 提币流程和时间 |
| KYC / 实名 / 認證 | KYC 验证说明 |
| 充值 / deposit / 入金 | 充值方式 |
| 安全 / security / 安全性 | 账户安全说明 |
| 合约 / futures | 合约交易说明 |
| 客服 / support / 人工 | 触发转人工 |
| （3次未匹配） | 自动转人工 |

---

## 6. 转人工流程

```
用户触发转人工
    ↓
sessions.status = 'waiting'
    ↓
/agent 页面收到 Realtime 通知，会话出现在"待接入"列表
    ↓
客服点击"接入"→ sessions.status = 'human'
    ↓
/chat 页面收到 Realtime 通知，显示"客服已接入"
    ↓
双向实时对话（messages 表 INSERT → Realtime 推送）
```

---

## 7. 三语实现

`lib/i18n.ts` 导出所有 UI 文本的三语字典。  
用户在聊天窗口顶部切换语言，`language` 字段写入 session，  
机器人按 session 语言返回对应语言的回答。

---

## 8. 演进路线

| 阶段 | 改动 | 用户侧变化 |
|---|---|---|
| **现在（Demo）** | 关键词匹配 `bot-rules.ts` | 无 |
| **阶段二（知识库上线后）** | 替换 bot 模块为 DeepSeek API + Supabase pgvector RAG | 无 |
| **阶段三（生产）** | agent 模块加企微 webhook，多渠道接入 | 无 |

---

## 9. 项目结构

```
bitv-cs-demo/
├── app/
│   ├── chat/
│   │   └── page.tsx          # 用户聊天页
│   ├── agent/
│   │   └── page.tsx          # 客服后台页
│   └── api/
│       └── bot/
│           └── route.ts      # 关键词匹配 API
├── lib/
│   ├── supabase.ts           # Supabase 客户端
│   ├── bot-rules.ts          # 关键词问答配置
│   └── i18n.ts               # 三语文本
├── components/
│   ├── ChatWidget.tsx         # 聊天窗口组件
│   ├── MessageBubble.tsx      # 消息气泡
│   └── AgentDashboard.tsx    # 客服后台组件
└── supabase/
    └── schema.sql            # 数据库建表语句
```

---

## 10. 交付标准

- [ ] `/chat` 页面可正常发送消息并收到机器人回复
- [ ] 转人工按钮触发后 `/agent` 页面实时出现通知
- [ ] 客服接入后双端消息实时同步（延迟 < 1s）
- [ ] 三语切换正常工作
- [ ] 部署到 Vercel，生成可分享 URL
- [ ] 演示脚本：从打开页面到完成人工接管全程 < 3 分钟
