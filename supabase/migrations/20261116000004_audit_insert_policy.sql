-- Users may append (never read, change or delete) their own audit entries, so
-- audit rows are written in the same transaction as the action they record.
grant insert on public.audit_log to authenticated;
create policy audit_log_insert_own on public.audit_log for insert to authenticated
  with check (user_id = auth.uid());
