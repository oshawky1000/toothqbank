-- ToothQBank: practical questions (questions with images) counted separately.
--
-- question_counts() now also says whether the questions it counts have images,
-- so the course page can show "Practical questions" apart from the written ones.
-- It still returns counts only, never question content. Older versions of the
-- website keep working: they simply add the extra rows together.

drop function public.question_counts();

create function public.question_counts()
returns table (
  course_id text,
  chapter_id bigint,
  category public.question_category,
  has_images boolean,
  question_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.course_id, q.chapter_id, q.category, cardinality(q.images) > 0, count(*)
  from public.questions q
  group by q.course_id, q.chapter_id, q.category, cardinality(q.images) > 0
$$;

revoke all on function public.question_counts() from public, anon, authenticated;
grant execute on function public.question_counts() to anon, authenticated;
