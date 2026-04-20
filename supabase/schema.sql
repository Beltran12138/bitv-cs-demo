-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- 会话表
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  status text not null default 'bot',
  -- status 取值: 'bot' | 'waiting' | 'human'
  language text not null default 'zh-CN',
  -- language 取值: 'zh-CN' | 'zh-TW' | 'en'
  created_at timestamptz default now()
);

-- 消息表
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  role text not null,
  -- role 取值: 'user' | 'bot' | 'agent'
  content text not null,
  created_at timestamptz default now()
);

-- 启用 Realtime（在 Supabase 控制台 SQL Editor 执行）
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table sessions;
