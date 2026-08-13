-- Enable row level security.
--
-- Until now every table was created without RLS, which in Supabase means the
-- anon key — a key that ships to the browser inside NEXT_PUBLIC_ — could read
-- and write all of them. For a chat application that stores conversation
-- transcripts, that is the whole transcript store, readable by anyone who opens
-- the page and reads the JS bundle.
--
-- ─── What this migration does, and what it deliberately does not ────────────
--
-- The fixture has no authentication. The user widget and the agent dashboard
-- hold the *same* anon key, and the dashboard is supposed to see every session
-- while a visitor is supposed to see only their own. No policy can separate
-- those two without an identity to key on, so this migration does not pretend
-- to. It draws the line where it can actually be drawn:
--
--   knowledge_chunks  anon SELECT allowed  — it is a published FAQ corpus, and
--                     the harness's retrieval path (match_knowledge) runs
--                     through it
--   sessions          no anon policy       — deny
--   messages          no anon policy       — deny
--   message_feedback  no anon policy       — deny
--
-- Under RLS with no policy, access is denied. That is the intent: transcripts
-- become server-only, reachable through the service role key from API routes.
--
-- ⚠️  This BREAKS the fixture's live chat. ChatWidget and AgentDashboard insert
-- rows and subscribe to postgres_changes directly with the anon key; Realtime
-- applies RLS, so both go silent. That is an accepted cost — the evaluation
-- harness never touches sessions or messages, and the deployment was removed.
-- To run the chat end to end locally, apply `20260813_dev_open_rls.sql`, and
-- read the warning at the top of it first.

alter table sessions          enable row level security;
alter table messages          enable row level security;
alter table message_feedback  enable row level security;
alter table knowledge_chunks  enable row level security;

-- The FAQ corpus is public by nature and is what retrieval reads.
drop policy if exists knowledge_chunks_anon_read on knowledge_chunks;
create policy knowledge_chunks_anon_read
  on knowledge_chunks for select
  to anon, authenticated
  using (true);

-- match_knowledge runs as the caller, so it inherits the policy above rather
-- than bypassing it. Left that way on purpose: a SECURITY DEFINER function
-- would silently re-open the table it queries.

-- sessions / messages / message_feedback intentionally have no policies.
-- Anything that needs them must go through a server route holding the service
-- role key, which bypasses RLS by design.
