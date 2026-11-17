-- The server connects as the database owner role and, for every user request,
-- runs `SET LOCAL ROLE authenticated` so RLS applies. That requires membership
-- in `authenticated` (Supabase normally grants this to `postgres`). Ensure it
-- where permitted; otherwise warn — /api/health reports the result.
do $$
begin
  if not pg_has_role(current_user, 'authenticated', 'member') then
    execute format('grant authenticated to %I', current_user);
  end if;
exception when insufficient_privilege then
  raise warning 'Could not grant role "authenticated" to %. Grant it manually: GRANT authenticated TO %;', current_user, current_user;
end $$;
