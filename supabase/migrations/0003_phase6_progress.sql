-- ToothQBank, Phase 6: saved progress.
--
-- my_course_history(course) returns the logged-in student's LATEST answer to
-- each question they have answered in that course: one row per question.
-- The website uses it for the progress bars and for the "Unanswered" and
-- "Incorrect only" filters when building a practice session.
--
-- It runs with the student's own permissions (security invoker), so the normal
-- security rules still apply: students only see their own answers, and only
-- for courses they can currently open.

create function public.my_course_history(p_course_id text)
returns table (question_id text, chapter_id bigint, is_correct boolean, answered_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (si.question_id)
    si.question_id, q.chapter_id, si.is_correct, si.answered_at
  from public.session_items si
  join public.questions q on q.id = si.question_id
  where si.student_id = (select auth.uid())
    and q.course_id = p_course_id
    and si.chosen is not null
  order by si.question_id, si.answered_at desc
$$;

revoke all on function public.my_course_history(text) from public, anon, authenticated;
grant execute on function public.my_course_history(text) to authenticated;
