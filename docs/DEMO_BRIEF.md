# BitV CS Demo · 飞书集成 V2 ｜ 老板汇报 brief

**日期** 2026-05-25 ｜ **PM** zhaohan326 ｜ **状态** ✅ 已上线 production

---

## BLUF

**已交付**：BitV 客服 Demo v2 完成飞书集成。客户在 App/Web 端发消息 → AI 自动应答 → 转人工触发飞书客服群弹卡片 → **客服在飞书内直接完成接单/查档/回复/关单全流程**，回复经 Supabase Realtime 实时推回客户端。客户档案同步沉淀至飞书多维表格（lark-base）作业务数据库。

**核心价值**：飞书 = 客服 console + 业务数据库二合一。客服无需开第二个后台，所有 BitV 客户支持工作在飞书内闭环。

---

## 整链路示意

```
[BitV App/Web 客户]
        ↓ 发消息
[/api/bot · Next.js + DeepSeek]
        ├─ 自动应答（8 专家 Agent + RAG）
        └─ intent='human' → pushLarkHandoff
                ↓
        [飞书客服群 · schema 2.0 卡片]
        ┌──────────────────────────────┐
        │ 🎫 客户工单 #cdd5e6f2         │
        │ 会话 / 意图 / 语言 / 状态       │
        │ 📨 用户消息: KYC L2 卡 3 天    │
        │ [📤 回复] [✋ 接单]            │
        │ [📋 查档] [🔒 关单]            │
        └──────────────────────────────┘
                ↓ 客服点按钮
        [/api/lark/event webhook]
                ↓
        ├─ open_reply  → 展开 form（多行 input）
        ├─ send_reply  → INSERT messages role=agent
        │     └→ Supabase Realtime → 客户端实时收
        ├─ accept      → status=human + agent_user 写档
        ├─ lookup      → 拉 lark-base 显示档案卡
        └─ close       → status=closed + 档案归档
                ↓
        [lark-base 客户档案表] · 业务数据库
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 App Router + React 19 + Tailwind |
| 实时 | Supabase Realtime (PostgreSQL) |
| AI | DeepSeek Chat API（OpenAI-compatible，¥1/M token，比 GPT 便宜 35x） |
| 客服中枢 | 飞书/Lark OpenAPI（schema 2.0 卡片 + bitable + 事件订阅） |
| 部署 | Vercel production · `bitv-cs-demo.vercel.app` |

---

## Demo 流程（演示给老板看 5 min）

| 时间 | 动作 | 看点 |
|---|---|---|
| 0:00 | 开 `bitv-cs-demo.vercel.app/chat` | 客户视角 |
| 0:15 | 客户输入「KYC 卡在 L2，3 天了能加急吗」 | DeepSeek 流式答 + 3 follow-up |
| 0:45 | 客户输入「人工」 | 触发 handoff |
| 0:50 | 切飞书 `BitV CS Demo 客服群` | **蓝色工单卡弹出** |
| 1:15 | 点「📋 查档」 | **卡片切紫色档案卡，base 数据来** |
| 1:45 | 点「✋ 接单」 | **卡片变 turquoise，agent_user 入档** |
| 2:00 | 点「📤 回复」 → 输入「KYC L2 已加急，5 min 内处理」 | **form 展开**，输入 → 「✅ 发送」 |
| 2:20 | 切回 /chat | **客户实时收到**（Supabase Realtime） |
| 2:30 | 切回飞书 | **卡片变绿，含回复原文** |
| 2:45 | 打开 lark-base 档案表 | **status=human，agent_user 填，timestamp 更新** |
| 3:00 | 点「🔒 关单」 | **卡片变 grey，base status=closed** |
| 3:30 | 总结 | 一张卡完成全流程 |

---

## 战略意义

| 维度 | 价值 |
|---|---|
| **客服效率** | 客服在飞书内不切应用，与内部 IM/Docs/审批同上下文 |
| **业务数据沉淀** | 每条工单自动入 lark-base，可直接做日/周/月报（飞书多维表格 + AnyGen 自动汇总） |
| **AI 全栈** | DeepSeek + 飞书生态原生集成，token 成本 ¥1/M（OpenAI $5/M = 35x 贵） |
| **可扩展** | 当前仅 BitV 一条产品线；后续可扩 OTC/RWA/托管业务，统一客服中枢 |
| **PM 自主性** | 全栈 PM 单人交付，无需 BD/外部供应商 |

---

## 关键不确定性 / 下一步

| Q | 待决 |
|---|---|
| Q1 | 是否纳入 BitV 生产客服系统正式技术栈？ |
| Q2 | 客服真名解析（飞书 contact API resolve open_id）是否必做？ |
| Q3 | 多渠道接入（WhatsApp/Telegram）走 Chatwoot 还是自建？参 v7 飞书研报 |
| Q4 | RLS 启用 + SFC 合规留痕（自建归档 ≠ 飞书自带）何时排上日程 |

**建议下一步**：W22 周会上桌讨论是否升正式技术栈 → 若是则给 4 周排期做合规留痕 + 多语言 + 客服真名 + 图片上传。

---

## 资源

- **Live**：https://bitv-cs-demo.vercel.app/chat
- **GitHub**：https://github.com/Beltran12138/bitv-cs-demo
- **集成文档**：`docs/LARK_INTEGRATION.md`（含 5 大踩坑修法）
- **飞书集成研报**：`feishu-research-20260525.md`（v7，三栈方案）
