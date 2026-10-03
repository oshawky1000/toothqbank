-- ToothQBank: question images.
--
-- 1. A PRIVATE storage bucket, question-images. Each image is stored as
--    <course id>/<file name>, e.g. op1/slide-03.jpg, using the file name from
--    the question file's "images" list.
-- 2. Who can load an image: only someone who can read a question that uses it.
--    The check below looks the image up in public.questions, and that table's
--    own rule only shows questions to admins and to approved students on their
--    bound device with the course unlocked. Everyone else gets nothing.
--    The website asks for short-lived signed links (1 hour), and Supabase only
--    hands one out after this check passes.
-- 3. Only admins can upload, replace or delete images.
-- 4. import_questions now refuses a file whose images are not uploaded yet,
--    and checks image file names. If anything is wrong, nothing is saved.

-- ---------------------------------------------------------------------------
-- The bucket (private: public = false)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  5242880,                                    -- 5 MB per image
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Image file names
-- ---------------------------------------------------------------------------
-- Letters, digits, spaces, dots, dashes, underscores and brackets, ending in
-- .jpg, .jpeg, .png, .webp or .gif. No folders (no "/").

create function public.is_valid_image_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}\.([Jj][Pp][Ee]?[Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Gg][Ii][Ff])$'
$$;

-- ---------------------------------------------------------------------------
-- Who can read and change images
-- ---------------------------------------------------------------------------

create policy "Read images of readable questions" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'question-images'
    -- public.questions is filtered by its own rule, so this only finds
    -- questions the current user is allowed to read.
    and exists (
      select 1 from public.questions q
      where q.course_id = (storage.foldername(name))[1]
        and storage.filename(name) = any (q.images)
    )
  );

create policy "Admins read all question images" on storage.objects
  for select to authenticated
  using (bucket_id = 'question-images' and (select public.is_admin()));

create policy "Admins upload question images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-images' and (select public.is_admin()));

create policy "Admins replace question images" on storage.objects
  for update to authenticated
  using (bucket_id = 'question-images' and (select public.is_admin()))
  with check (bucket_id = 'question-images' and (select public.is_admin()));

create policy "Admins delete question images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-images' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Import: also check images (same as before otherwise)
-- ---------------------------------------------------------------------------

create or replace function public.import_questions(p_file jsonb)
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
  v_images text[];
  v_image text;
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

    -- Images: valid names, and each one already uploaded to <course>/<name>.
    if coalesce(jsonb_typeof(v_q -> 'images'), 'null') not in ('array', 'null') then
      raise exception 'Question %: images must be a list of file names', v_id;
    end if;
    v_images := coalesce(array(select jsonb_array_elements_text(coalesce(v_q -> 'images', '[]'::jsonb))), '{}');
    foreach v_image in array v_images loop
      if not public.is_valid_image_name(v_image) then
        raise exception 'Question %: image file name "%" is not allowed', v_id, v_image;
      end if;
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'question-images' and o.name = v_course || '/' || v_image
      ) then
        raise exception 'Question %: image "%" has not been uploaded', v_id, v_image;
      end if;
    end loop;

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
      v_images
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

revoke all on function public.is_valid_image_name(text) from public, anon, authenticated;
revoke all on function public.import_questions(jsonb) from public, anon, authenticated;
grant execute on function public.import_questions(jsonb) to authenticated;
