-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists vector;          -- pgvector for RAG embeddings

-- ── sessions ──────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id         uuid        primary key default uuid_generate_v4(),
  status     text        not null default 'bot',
  -- status: 'bot' | 'waiting' | 'human'
  language   text        not null default 'zh-CN',
  -- language: 'zh-CN' | 'zh-TW' | 'en'
  created_at timestamptz default now()
);

-- ── messages ──────────────────────────────────────────────────────────────────
create table if not exists messages (
  id         uuid        primary key default uuid_generate_v4(),
  session_id uuid        not null references sessions(id) on delete cascade,
  role       text        not null,
  -- role: 'user' | 'bot' | 'agent'
  content    text        not null,
  created_at timestamptz default now()
);

create index if not exists messages_session_id_idx on messages(session_id);

-- ── message_feedback ──────────────────────────────────────────────────────────
create table if not exists message_feedback (
  id         uuid        primary key default uuid_generate_v4(),
  message_id uuid        not null references messages(id) on delete cascade,
  rating     smallint    not null check (rating in (1, -1)),
  -- 1 = thumbs up, -1 = thumbs down
  created_at timestamptz default now(),
  unique (message_id)   -- one rating per message
);

-- ── knowledge_chunks (RAG) ────────────────────────────────────────────────────
create table if not exists knowledge_chunks (
  id         uuid        primary key default uuid_generate_v4(),
  intent     text        not null,
  title      text        not null,
  content    text        not null,
  embedding  vector(1536),                      -- text-embedding-3-small dimensions
  created_at timestamptz default now()
);

-- IVFFlat index for fast approximate nearest-neighbor search
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── match_knowledge RPC ───────────────────────────────────────────────────────
-- Called by lib/knowledge/search.ts for semantic similarity search
create or replace function match_knowledge(
  query_embedding vector(1536),
  match_count     int     default 3,
  filter_intent   text    default null
)
returns table (
  id          uuid,
  intent      text,
  title       text,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    id,
    intent,
    title,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where filter_intent is null or intent = filter_intent
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table sessions;
