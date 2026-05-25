# BitV CS Demo · Lark 集成（v7）

## 架构

```
[用户 /chat]
   ↓ 发消息
[POST /api/bot]
   ├─ DeepSeek 自动答（现有）
   └─ intent='human' → pushLarkHandoff()
        ↓
   [lib/lark/client.sendMessage 推卡片到客服群]
        ↓ 卡片：[回复][接单][查档][关单]
        ↓
   [客服在飞书群点按钮 / 输入回复 → POST /api/lark/event]
        ├─ card.action.trigger
        │   ├─ open_reply  → 展开 input form
        │   ├─ send_reply  → INSERT messages role=agent → Realtime 推回 ChatWidget
        │   ├─ accept      → sessions.status=human + base 更新
        │   ├─ lookup      → 拉 base record 显示档案卡
        │   └─ close       → sessions.status=closed + base 更新
        └─ im.message.receive_v1（备用：客服直接 @机器人回复）
```

## 飞书后台一次性设置

### 1. 建自建应用

- https://open.feishu.cn → 开发者后台 → 创建企业自建应用
- 名称：`BitV CS Demo`
- **权限管理 → 开通**：
  - `im:message:send_as_bot` — 以应用身份发消息
  - `im:message` — 接收消息
  - `im:message.group_at_msg` — 群中 @机器人
  - `im:message.p2p_msg` — 单聊（可选）
  - `im:resource` — 上传图片
  - `bitable:app` — 操作 base
- **凭证与基础信息**：记录 `App ID` / `App Secret` / `Verification Token`
- **事件订阅**：
  - 配置请求 URL：`https://<your-vercel-preview>.vercel.app/api/lark/event`
  - 订阅 `card.action.trigger` 和 `im.message.receive_v1`
- **机器人**：启用机器人

### 2. 客服群

- 飞书 IM 创建群 `BitV CS Demo 客服群`
- 把 `BitV CS Demo` 机器人加入群
- 群设置 → 群信息 → 复制 `chat_id`（`oc_xxx`）

### 3. 多维表格客户档案

- 飞书云文档新建多维表格 `BitV CS Demo 客户档案`
- 字段：

| 字段名 | 类型 |
|---|---|
| session_id | 文本 |
| user_anon | 文本 |
| intent | 文本 |
| status | 单选（bot / waiting / human / closed）|
| start_at | 日期 |
| last_msg_at | 日期 |
| agent_user | 文本 |
| messages_count | 数字 |
| notes | 文本 |

- 表格 URL: `https://xxx.feishu.cn/base/<APP_TOKEN>?table=<TABLE_ID>&view=...`
- 把机器人加为协作者（可编辑）

## 本地配置

复制 `.env.local.example` 到 `.env.local`，填入 7 个 LARK 字段。

## 数据库 migration

```sql
-- supabase/migrations/20260525_lark_integration.sql
alter table sessions add column if not exists lark_thread_root_msg_id text;
alter table sessions add column if not exists lark_base_record_id text;
alter table sessions add column if not exists intent text;
```

在 Supabase SQL Editor 跑一次。

## Smoke 测试

```bash
npm run lark:smoke
```

成功应见：
1. 客服群弹一张「客户工单 #smoke-xxx」卡片
2. lark-base 多一行 smoke-test 记录
3. 控制台打印 4 个 ✅

## Demo 流程（5 分钟）

| 时间 | 动作 | 展示重点 |
|---|---|---|
| 0:00 | 打开 cs-demo-beta.vercel.app/chat | 客户视角 |
| 0:15 | 客户问「KYC 怎么这么慢？提交 3 天了」 | DeepSeek 自动答（流式）|
| 0:45 | 客户问「人工」 | 触发 handoff |
| 0:50 | 切到飞书客服群 | 弹一张卡片，含客户意图/消息/4 按钮 |
| 1:15 | 客服点「📋 查档」 | 卡片切到客户档案卡，base 数据来 |
| 1:30 | 点「↩️ 返回工单」 | 回到主卡 |
| 1:45 | 客服点「✋ 接单」 | 卡片变 turquoise 状态卡 |
| 2:00 | 点「📤 回复」 | 卡片展开 input form |
| 2:15 | 输入「KYC L2 审核已加急，请稍等 5 分钟」 | 实时回客户 |
| 2:20 | 切回 /chat | 客户端实时收到回复（Supabase Realtime）|
| 2:30 | 切回飞书 | 卡片变 green，含「客服回复」内容 |
| 2:45 | 打开 lark-base | 客户档案 status=human / agent_user=客服-xxx |
| 3:00 | 在飞书点「🔒 关单」 | 卡片变 grey，base status=closed |
| 3:30 | 总结：一张卡完成接单+查档+回复+关单四操作，**飞书既是客服 console 也是业务数据库** | 演示 ROI |

## 故障排查

| 症状 | 原因 | 解决 |
|---|---|---|
| smoke 失败 `invalid token` | LARK_APP_SECRET 错 | 重抄 |
| 卡片发不出 `Bot has no permission to send to chat` | 机器人没加群 | 群设置 → 加机器人 |
| 事件回调 `url_verification` 失败 | webhook URL 不通 | 检查 vercel preview 是否部署 |
| 按钮点击无反应 | 事件订阅未配 card.action.trigger | 飞书开发者后台 → 事件订阅 → 添加 |
| base 写入失败 `forbidden` | 机器人未授权 base | base 协作者添加机器人 |

## 关键文件

```
lib/lark/
  client.ts       # tenant_access_token + send/reply message
  cards.ts        # 4 种卡片 builder
  base.ts         # base record CRUD
  verify.ts       # 事件订阅签名 + 解密
app/api/lark/event/route.ts  # webhook
app/api/bot/route.ts          # pushLarkHandoff() 在 intent=human 时调用
scripts/lark-smoke.ts         # smoke test
supabase/migrations/20260525_lark_integration.sql
```
