-- ToothQBank, Phase 2: database + auth
-- Tables, security rules (Row Level Security), seed courses and chapters,
-- the sign-up trigger and the one-device-per-account check.
--
-- Roles used by Supabase:
--   anon          = a visitor who is not logged in
--   authenticated = any logged-in user (students and admins)
-- Nothing is readable or writable unless it is granted below AND allowed by a policy.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.account_status as enum ('pending', 'approved', 'rejected', 'revoked');
create type public.question_category as enum ('past_paper', 'quiz_midterm', 'chapter');

-- ---------------------------------------------------------------------------
-- Course layout: semesters, courses, chapters (public)
-- ---------------------------------------------------------------------------

create table public.semesters (
  id text primary key,                       -- e.g. 'y3s1'
  year smallint not null check (year between 1 and 6),
  number smallint not null check (number between 1 and 2),
  unique (year, number)
);

create table public.courses (
  id text primary key check (id ~ '^[a-z0-9]+$'),   -- e.g. 'gm1', matches course_id in question files
  semester_id text not null references public.semesters (id),
  name text not null,
  position integer not null,
  created_at timestamptz not null default now()
);
create index courses_semester_id_idx on public.courses (semester_id);

create table public.chapters (
  id bigint generated always as identity primary key,
  course_id text not null references public.courses (id) on delete cascade,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (course_id, name),
  unique (course_id, id)
);

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

-- Phone numbers are stored as digits only, with the country code and no '+',
-- e.g. 201012345678. Egyptian numbers (country code 20) must be mobiles.
create function public.is_valid_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_phone ~ '^[1-9][0-9]{7,14}$'
     and (p_phone !~ '^20' or p_phone ~ '^201[0125][0-9]{8}$')
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text not null unique check (public.is_valid_phone(phone)),
  status public.account_status not null default 'pending',
  is_admin boolean not null default false,
  device_id text,
  device_bound_at timestamptz,
  created_at timestamptz not null default now()
);

-- Admin-only notes (e.g. "Paid InstaPay 3 Nov, GM1"), kept apart so students never see them.
create table public.student_notes (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.course_unlocks (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null references public.courses (id) on delete cascade,
  unlocked_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_id, course_id)
);
create index course_unlocks_course_id_idx on public.course_unlocks (course_id);
create index course_unlocks_unlocked_by_idx on public.course_unlocks (unlocked_by);

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------

create table public.questions (
  id text primary key,                       -- e.g. 'GM1-007', stable across re-imports
  course_id text not null references public.courses (id),
  chapter_id bigint not null,
  lecture text,
  category public.question_category not null,
  exam_label text,
  stem text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  answer text not null,
  explanation text not null default '',
  times_seen integer not null default 1 check (times_seen >= 0),
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the chapter must belong to the same course
  foreign key (course_id, chapter_id) references public.chapters (course_id, id),
  -- the answer must be one of the option keys
  check (options @> jsonb_build_array(jsonb_build_object('key', answer)))
);
create index questions_course_chapter_idx on public.questions (course_id, chapter_id);

-- Internal quality fields from the question files. Admins only, never shown to students.
create table public.question_internal (
  question_id text primary key references public.questions (id) on delete cascade,
  answer_status text check (answer_status in ('confirmed', 'verified', 'corrected')),
  source_pages text
);

-- ---------------------------------------------------------------------------
-- Practice sessions, answers and error reports (used from Phase 5)
-- ---------------------------------------------------------------------------

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id text not null references public.courses (id) on delete cascade,
  mode text not null check (mode in ('tutor', 'timed')),
  settings jsonb not null default '{}',      -- chapters, sections, filter, order chosen by the student
  seconds_per_question integer check (seconds_per_question > 0),
  current_position integer not null default 0,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index practice_sessions_student_id_idx on public.practice_sessions (student_id);
create index practice_sessions_course_id_idx on public.practice_sessions (course_id);

-- One row per question in a session. Holds the student's answer.
create table public.session_items (
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  position integer not null,
  question_id text not null references public.questions (id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  chosen text,
  is_correct boolean,                        -- set by the database, not the browser
  flagged boolean not null default false,
  time_spent_seconds integer check (time_spent_seconds >= 0),
  answered_at timestamptz,
  primary key (session_id, position),
  unique (session_id, question_id)
);
create index session_items_student_question_idx on public.session_items (student_id, question_id);
create index session_items_question_id_idx on public.session_items (question_id);

create table public.question_reports (
  id bigint generated always as identity primary key,
  question_id text not null references public.questions (id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 100),
  comment text not null default '' check (char_length(comment) <= 1000),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index question_reports_question_id_idx on public.question_reports (question_id);
create index question_reports_student_id_idx on public.question_reports (student_id);
create index question_reports_resolved_by_idx on public.question_reports (resolved_by);

-- ---------------------------------------------------------------------------
-- Helper functions used by the security rules
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- The device ID the browser sends with every request (header x-device-id).
create function public.request_device_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-device-id',
    ''
  )
$$;

-- Courses whose questions the current user may read:
--   admins: every course
--   students: only if approved, on their bound device, and the course is unlocked for them
create function public.accessible_course_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.courses c
  join public.profiles p on p.id = auth.uid()
  where p.is_admin
     or (
       p.status = 'approved'
       and p.device_id is not null
       and p.device_id = public.request_device_id()
       and exists (
         select 1 from public.course_unlocks u
         where u.student_id = p.id and u.course_id = c.id
       )
     )
$$;

-- Question counts for the course layout, without any question content. Public.
create function public.question_counts()
returns table (course_id text, chapter_id bigint, category public.question_category, question_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select q.course_id, q.chapter_id, q.category, count(*)
  from public.questions q
  group by q.course_id, q.chapter_id, q.category
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: create the profile from the new login
-- ---------------------------------------------------------------------------
-- Students sign up with a hidden email built from their phone number,
-- e.g. 201012345678@students.toothqbank.app. Any other kind of sign-up is refused.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := split_part(new.email, '@', 1);
  v_name text := regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '\s+', ' ', 'g');
begin
  if new.email is null
     or lower(split_part(new.email, '@', 2)) <> 'students.toothqbank.app'
     or not public.is_valid_phone(v_phone) then
    raise exception 'ToothQBank accounts must sign up with a valid phone number';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Full name is required';
  end if;

  insert into public.profiles (id, full_name, phone) values (new.id, v_name, v_phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- One device per account
-- ---------------------------------------------------------------------------
-- Called by the website right after login. Returns 'ok' or 'blocked'.
-- The first device to log in becomes the bound device. Admins are exempt.

create function public.claim_device(p_device_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if p_device_id is null or p_device_id !~ '^[A-Za-z0-9-]{16,64}$' then
    raise exception 'Invalid device id';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  if v_profile.is_admin then
    return 'ok';
  end if;

  if v_profile.device_id is null then
    update public.profiles
      set device_id = p_device_id, device_bound_at = now()
      where id = v_profile.id;
    return 'ok';
  end if;

  if v_profile.device_id = p_device_id then
    return 'ok';
  end if;
  return 'blocked';
end;
$$;

-- ---------------------------------------------------------------------------
-- Answers: the database decides whether an answer is correct
-- ---------------------------------------------------------------------------

create function public.set_session_item_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.questions;
begin
  if new.chosen is null then
    new.is_correct := null;
    new.answered_at := null;
    return new;
  end if;

  select * into v_question from public.questions where id = new.question_id;
  if not exists (
    select 1 from jsonb_array_elements(v_question.options) o where o ->> 'key' = new.chosen
  ) then
    raise exception 'Chosen option does not exist';
  end if;

  new.is_correct := (new.chosen = v_question.answer);
  if tg_op = 'INSERT' or new.chosen is distinct from old.chosen then
    new.answered_at := now();
  else
    new.answered_at := old.answered_at;
  end if;
  return new;
end;
$$;

create trigger session_items_set_result
  before insert or update on public.session_items
  for each row execute function public.set_session_item_result();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.semesters enable row level security;
alter table public.courses enable row level security;
alter table public.chapters enable row level security;
alter table public.profiles enable row level security;
alter table public.student_notes enable row level security;
alter table public.course_unlocks enable row level security;
alter table public.questions enable row level security;
alter table public.question_internal enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.session_items enable row level security;
alter table public.question_reports enable row level security;

-- Course layout: everyone can read; only admins can change.
create policy "Anyone can read semesters" on public.semesters
  for select to anon, authenticated using (true);
create policy "Admins manage semesters" on public.semesters
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone can read courses" on public.courses
  for select to anon, authenticated using (true);
create policy "Admins manage courses" on public.courses
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Anyone can read chapters" on public.chapters
  for select to anon, authenticated using (true);
create policy "Admins manage chapters" on public.chapters
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Profiles: students read only their own; only admins change them.
-- (New profiles are created by the sign-up trigger; devices are bound by claim_device.)
create policy "Read own profile, admins read all" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins update profiles" on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admins manage notes" on public.student_notes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Course unlocks: students see their own; only admins add or remove.
create policy "Read own unlocks, admins read all" on public.course_unlocks
  for select to authenticated using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins add unlocks" on public.course_unlocks
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins remove unlocks" on public.course_unlocks
  for delete to authenticated using ((select public.is_admin()));

-- Questions: readable only for unlocked courses (see accessible_course_ids); only admins change.
create policy "Read questions of accessible courses" on public.questions
  for select to authenticated using (course_id in (select public.accessible_course_ids()));
create policy "Admins add questions" on public.questions
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update questions" on public.questions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete questions" on public.questions
  for delete to authenticated using ((select public.is_admin()));

create policy "Admins manage internal question fields" on public.question_internal
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Practice sessions: students read and write only their own, only for accessible courses.
create policy "Read own sessions, admins read all" on public.practice_sessions
  for select to authenticated using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy "Start own sessions in accessible courses" on public.practice_sessions
  for insert to authenticated
  with check (student_id = (select auth.uid()) and course_id in (select public.accessible_course_ids()));
create policy "Update own sessions" on public.practice_sessions
  for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy "Delete own sessions" on public.practice_sessions
  for delete to authenticated using (student_id = (select auth.uid()));

create policy "Read own answers, admins read all" on public.session_items
  for select to authenticated using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy "Add own answers" on public.session_items
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (
      select 1
      from public.practice_sessions s
      join public.questions q on q.course_id = s.course_id   -- questions are filtered by their own rule
      where s.id = session_id and s.student_id = (select auth.uid()) and q.id = question_id
    )
  );
create policy "Update own answers" on public.session_items
  for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

-- Error reports: students add and read their own; admins read all and resolve.
create policy "Read own reports, admins read all" on public.question_reports
  for select to authenticated using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy "Report accessible questions" on public.question_reports
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and resolved_at is null
    and resolved_by is null
    and exists (select 1 from public.questions q where q.id = question_id)
  );
create policy "Admins resolve reports" on public.question_reports
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Table and function permissions (on top of the rules above)
-- ---------------------------------------------------------------------------

revoke all on
  public.semesters, public.courses, public.chapters, public.profiles, public.student_notes,
  public.course_unlocks, public.questions, public.question_internal, public.practice_sessions,
  public.session_items, public.question_reports
from anon, authenticated;

grant select on public.semesters, public.courses, public.chapters to anon;
grant select, insert, update, delete on public.semesters, public.courses, public.chapters to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, status, is_admin, device_id, device_bound_at) on public.profiles to authenticated;

grant select, insert, update, delete on public.student_notes to authenticated;
grant select, insert, delete on public.course_unlocks to authenticated;
grant select, insert, update, delete on public.questions, public.question_internal to authenticated;

grant select, insert, delete on public.practice_sessions to authenticated;
grant update (settings, current_position, finished_at) on public.practice_sessions to authenticated;

grant select, insert on public.session_items to authenticated;
grant update (chosen, flagged, time_spent_seconds) on public.session_items to authenticated;

grant select, insert on public.question_reports to authenticated;
grant update (resolved_at, resolved_by) on public.question_reports to authenticated;

revoke all on function
  public.is_valid_phone(text), public.is_admin(), public.request_device_id(),
  public.accessible_course_ids(), public.question_counts(), public.handle_new_user(),
  public.claim_device(text), public.set_session_item_result()
from public, anon, authenticated;

grant execute on function public.question_counts() to anon, authenticated;
grant execute on function
  public.is_admin(), public.accessible_course_ids(), public.claim_device(text), public.is_valid_phone(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.semesters (id, year, number) values
  ('y3s1', 3, 1),
  ('y3s2', 3, 2);

insert into public.courses (id, semester_id, name, position) values
  ('gm1',   'y3s1', 'General Medicine 1',         1),
  ('gs1',   'y3s1', 'General Surgery 1',          2),
  ('op1',   'y3s1', 'Oral Pathology 1',           3),
  ('rad1',  'y3s1', 'Radiology 1',                4),
  ('fp1',   'y3s1', 'Fixed Prosthodontics 1',     5),
  ('rest1', 'y3s1', 'Restorative 1',              6),
  ('rp1',   'y3s1', 'Removable Prosthodontics 1', 7);

insert into public.chapters (course_id, name, position) values
  ('gm1', 'Heart failure',            1),
  ('gm1', 'Chest pain',               2),
  ('gm1', 'Cyanosis',                 3),
  ('gm1', 'Edema',                    4),
  ('gm1', 'Rheumatic fever',          5),
  ('gm1', 'Infective endocarditis',   6),
  ('gm1', 'Systemic hypertension',    7),
  ('gm1', 'Syncope',                  8),
  ('gm1', 'Hemoptysis',               9),
  ('gm1', 'Clubbing of fingers',     10),
  ('gm1', 'Foreign body inhalation', 11),
  ('gm1', 'Gastroenterology',        12),
  ('gm1', 'Disease of mouth',        13),
  ('gm1', 'Dysphagia',               14),
  ('gm1', 'Ascites',                 15),
  ('gm1', 'Hematemesis',             16);
