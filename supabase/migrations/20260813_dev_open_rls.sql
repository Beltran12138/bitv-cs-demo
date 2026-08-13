-- ⚠️  LOCAL DEVELOPMENT ONLY. DO NOT APPLY TO ANY REACHABLE DATABASE.
--
-- This grants the anon key full read and write on conversation transcripts so
-- the fixture's live chat and Realtime subscriptions work end to end. The anon
-- key is public — it is compiled into the browser bundle. Applying this to a
-- database that anything can reach makes every transcript world-readable and
-- world-writable.
--
-- It exists because the fixture is a demo of a support agent and is sometimes
-- worth running whole. It is a separate file from the migration that enables
-- RLS so that applying it is a deliberate act, not a default.
--
-- Undo: re-run 20260813_enable_rls.sql, which drops nothing but is preceded by
-- the drops below being reversed — or simply drop these three policies.

drop policy if exists sessions_anon_all on sessions;
create policy sessions_anon_all
  on sessions for all
  to anon
  using (true) with check (true);

drop policy if exists messages_anon_all on messages;
create policy messages_anon_all
  on messages for all
  to anon
  using (true) with check (true);

drop policy if exists message_feedback_anon_all on message_feedback;
create policy message_feedback_anon_all
  on message_feedback for all
  to anon
  using (true) with check (true);
