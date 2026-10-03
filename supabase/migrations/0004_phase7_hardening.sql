-- ToothQBank, Phase 7: security hardening.
--
-- 1. Answers: a student may only change an answer (or flag) on a question they
--    can still open. Before, a student whose course was locked again could still
--    change old answers and see from the result whether they were right.
-- 2. rls_auto_enable: Supabase adds this helper to new projects (it switches on
--    Row Level Security for new tables). It cannot do anything when called from
--    the website, but nobody needs to call it, so remove that permission.

drop policy "Update own answers" on public.session_items;
create policy "Update own answers" on public.session_items
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (
    student_id = (select auth.uid())
    -- questions are filtered by their own rule, so this only finds questions the student can open
    and exists (select 1 from public.questions q where q.id = question_id)
  );

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
