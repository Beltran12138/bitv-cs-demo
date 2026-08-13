# Acme CS Demo · Lark 集成（v7）

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
- 名称：`Acme CS Demo`
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

- 飞书 IM 创建群 `Acme CS Demo 客服群`
- 把 `Acme CS Demo` 机器人加入群
- 群设置 → 群信息 → 复制 `chat_id`（`oc_xxx`）

### 3. 多维表格客户档案

- 飞书云文档新建多维表格 `Acme CS Demo 客户档案`
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
| 0:00 | 本地 `npm run dev` 打开 /chat | 客户视角 |
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
  cards.ts        # 4 种卡片 builder（全 schema 2.0）
  base.ts         # base record CRUD
  verify.ts       # 事件订阅签名 + 解密
app/api/lark/event/route.ts  # webhook（含 send_reply fire-and-forget 优化）
app/api/bot/route.ts          # pushLarkHandoff() 在 intent=human 时调用
scripts/lark-smoke.ts         # smoke test
scripts/lark-resolve-wiki.ts  # wiki node → base app_token + table_id 解析
supabase/migrations/20260525_lark_integration.sql
```

---

## 集成踩坑五大（2026-05-25 实战）

下次做飞书集成必读，避免 4-6 小时排错。

### 坑 1: Vercel CLI `--no-sensitive` flag 必加

`vercel env add NAME production --value <v> --yes` 看似成功（返 "Added"），但 production runtime 读到空字符串。原因：sensitive 模式默认开，`--value` 被忽略。**修法**：必加 `--no-sensitive`。

### 坑 2: 「事件订阅」≠「卡片回调」是两个独立 tab

飞书后台「开发配置 → 事件与回调」下有两 tab：**事件订阅**（业务事件）和 **回调配置**（卡片专用）。卡片按钮交互必须配后者，且订阅 `card.action.trigger`，否则报 `200340`。**改后必须创建应用版本 + 发布**生效。

### 坑 3: `input` 必须 schema 2.0 + form 容器

schema 1.0 不支持 input。schema 2.0 input 必须包在 `tag: 'form'` 容器内（不能裸放 body.elements）。卡片顶层必须 `"schema": "2.0"`。否则报 `200673`。

### 坑 4: form 内所有交互组件必须 `name`

form 容器内的 button 也需 `name`（不止 input）。`name` 在卡片内唯一。**取消按钮等非提交按钮挪出 form**。否则报 `200530`。

### 坑 5: webhook 3 秒超时

飞书要求卡片回调 3 秒内响应。webhook 内 await 多个外部 API（supabase + 飞书）易超时。**修法**：仅 await 渲染必需的，其余（lark-base 更新、sessions.status 改写）改 fire-and-forget：

```typescript
// CRITICAL: await
const { error } = await sb().from('messages').insert({...})

// NON-CRITICAL: fire-and-forget
sb().from('sessions').update({status: 'human'}).eq('id', sid).then(() => {})
updateCustomerRecord(rid, {...}).catch(e => console.warn(e))

return cardUpdate(newCard)
```

### 附加坑

- **schema 1.0 ↔ 2.0 不可互升**：首推卡片是 1.0，所有更新卡必须 1.0；反之 2.0 始终 2.0。建议从一开始就全 2.0。报 `200830` 即此问题
- **wiki node ≠ base app_token**：用户贴的 base URL 常为 wiki 链接（`/wiki/At3xxx`），不是直接 base URL（`/base/bascxxx?table=tblyyy`）。需先 `GET /open-apis/wiki/v2/spaces/get_node?token=<wiki>` 拿 obj_token。脚本：`scripts/lark-resolve-wiki.ts`
- **海外 Lark vs 国内飞书 host 不同**：`open.larksuite.com`（海外） vs `open.feishu.cn`（国内）。代码用 env `LARK_DOMAIN` 切换
- **base 字段读出是 segments 数组**：飞书 base API 返文本字段为 `[{text, type}]`，需 flatten 才能用为 string
- **vercel CLI on PowerShell stdin 失效**：`echo "v" | vercel env add` 报 `git_branch_required`。必须 `--value` flag（且 `--no-sensitive`）
