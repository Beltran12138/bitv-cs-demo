// Resolve wiki node token → base app_token + first table_id
// Run: npx tsx scripts/lark-resolve-wiki.ts <WIKI_NODE_TOKEN>

import { config } from 'dotenv'
config({ path: '.env.local' })

const HOST = process.env.LARK_DOMAIN ?? 'https://open.feishu.cn'
const WIKI_NODE = process.argv[2] ?? 'At3swqbM5iTNuJkYeC4jTF4Zpxn'

async function getToken(): Promise<string> {
  const res = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  })
  const j = await res.json() as { code: number; msg: string; tenant_access_token?: string }
  if (j.code !== 0 || !j.tenant_access_token) throw new Error(`token: ${j.msg}`)
  return j.tenant_access_token
}

async function main() {
  console.log(`🌐 host: ${HOST}`)
  const tok = await getToken()

  // 1) Wiki node → obj_token
  console.log(`🔍 解析 wiki node: ${WIKI_NODE}`)
  const wRes = await fetch(
    `${HOST}/open-apis/wiki/v2/spaces/get_node?token=${WIKI_NODE}`,
    { headers: { Authorization: `Bearer ${tok}` } }
  )
  const wJson = await wRes.json() as {
    code: number; msg: string
    data?: { node?: { obj_token: string; obj_type: string; title: string } }
  }
  if (wJson.code !== 0 || !wJson.data?.node) {
    throw new Error(`wiki resolve fail: ${wJson.msg} (code=${wJson.code})`)
  }
  const node = wJson.data.node
  console.log(`   title: ${node.title}`)
  console.log(`   obj_type: ${node.obj_type}`)
  console.log(`   obj_token (= BASE_APP_TOKEN): ${node.obj_token}`)

  if (node.obj_type !== 'bitable') {
    throw new Error(`expected bitable, got ${node.obj_type}`)
  }

  // 2) List tables in base
  const tRes = await fetch(
    `${HOST}/open-apis/bitable/v1/apps/${node.obj_token}/tables?page_size=20`,
    { headers: { Authorization: `Bearer ${tok}` } }
  )
  const tJson = await tRes.json() as {
    code: number; msg: string
    data?: { items?: Array<{ table_id: string; name: string }> }
  }
  if (tJson.code !== 0) throw new Error(`list tables: ${tJson.msg}`)

  const tables = tJson.data?.items ?? []
  console.log(`\n📋 该 base 含 ${tables.length} 张表:`)
  for (const t of tables) {
    console.log(`   - ${t.name}  (table_id = ${t.table_id})`)
  }

  if (tables.length === 0) throw new Error('base 内无表')

  const first = tables[0]
  console.log(`\n✅ 推荐配置:`)
  console.log(`   LARK_BASE_APP_TOKEN=${node.obj_token}`)
  console.log(`   LARK_BASE_TABLE_ID=${first.table_id}    # ← 第一张表「${first.name}」`)
}

main().catch((e) => { console.error('❌', e); process.exit(1) })
