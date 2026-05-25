-- v7 migration: lark cs integration columns on sessions
alter table sessions add column if not exists lark_thread_root_msg_id text;
alter table sessions add column if not exists lark_base_record_id text;
alter table sessions add column if not exists intent text;
