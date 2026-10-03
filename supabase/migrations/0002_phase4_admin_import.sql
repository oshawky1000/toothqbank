-- ToothQBank, Phase 4: question import for the admin dashboard.
--
-- import_questions(file) takes a whole question file (docs/question-format.md)
-- and saves it in one go. If anything in the file is wrong, nothing is saved.
--   * Questions are matched by id: an existing id is updated, a new id is added.
--   * Chapters that do not exist yet are created after the existing chapters.
--   * answer_status and source_pages go to the admin-only question_internal table.
-- Only admins can run it.

create function public.import_questions(p_file jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course text := p_file -> 'course' ->> 'id';
  v_q jsonb;
  v_id text;
  v_chapter_name text;
  v_chapter_id bigint;
  v_existed boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_new_chapters text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only admins can import questions';
  end if;
  if (p_file ->> 'format_version') is distinct from '1' then
    raise exception 'format_version must be 1';
  end if;
  if not exists (select 1 from public.courses c where c.id = v_course) then
    raise exception 'Unknown course id: %', coalesce(v_course, '(missing)');
  end if;
  if jsonb_typeof(p_file -> 'questions') is distinct from 'array' then
    raise exception 'questions must be a list';
  end if;

  for v_q in select value from jsonb_array_elements(p_file -> 'questions') loop
    v_id := btrim(v_q ->> 'id');
    v_chapter_name := regexp_replace(btrim(coalesce(v_q ->> 'chapter', '')), '\s+', ' ', 'g');

    if coalesce(v_id, '') = '' then
      raise exception 'A question has no id';
    end if;
    if (v_q ->> 'course_id') is distinct from v_course then
      raise exception 'Question %: course_id must be %', v_id, v_course;
    end if;
    if v_chapter_name = '' then
      raise exception 'Question %: chapter is missing', v_id;
    end if;

    -- Find the chapter (ignoring capital letters), or add it at the end.
    select ch.id into v_chapter_id
    from public.chapters ch
    where ch.course_id = v_course and lower(ch.name) = lower(v_chapter_name);
    if not found then
      insert into public.chapters (course_id, name, position)
      values (
        v_course,
        v_chapter_name,
        (select coalesce(max(ch.position), 0) + 1 from public.chapters ch where ch.course_id = v_course)
      )
      returning id into v_chapter_id;
      v_new_chapters := v_new_chapters || v_chapter_name;
    end if;

    v_existed := exists (select 1 from public.questions q where q.id = v_id);

    insert into public.questions (
      id, course_id, chapter_id, lecture, category, exam_label,
      stem, options, answer, explanation, times_seen, images
    ) values (
      v_id,
      v_course,
      v_chapter_id,
      nullif(btrim(v_q ->> 'lecture'), ''),
      (v_q ->> 'category')::public.question_category,
      nullif(btrim(v_q ->> 'exam_label'), ''),
      v_q ->> 'stem',
      v_q -> 'options',
      v_q ->> 'answer',
      coalesce(v_q ->> 'explanation', ''),
      coalesce((v_q ->> 'times_seen')::integer, 1),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_q -> 'images', '[]'::jsonb))), '{}')
    )
    on conflict (id) do update set
      course_id = excluded.course_id,
      chapter_id = excluded.chapter_id,
      lecture = excluded.lecture,
      category = excluded.category,
      exam_label = excluded.exam_label,
      stem = excluded.stem,
      options = excluded.options,
      answer = excluded.answer,
      explanation = excluded.explanation,
      times_seen = excluded.times_seen,
      images = excluded.images,
      updated_at = now();

    insert into public.question_internal (question_id, answer_status, source_pages)
    values (v_id, nullif(v_q ->> 'answer_status', ''), nullif(v_q ->> 'source_pages', ''))
    on conflict (question_id) do update set
      answer_status = excluded.answer_status,
      source_pages = excluded.source_pages;

    if v_existed then
      v_updated := v_updated + 1;
    else
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'new_chapters', to_jsonb(v_new_chapters)
  );
end;
$$;

revoke all on function public.import_questions(jsonb) from public, anon, authenticated;
grant execute on function public.import_questions(jsonb) to authenticated;
