-- EMIS-style lesson plans and separate lesson-note PDF uploads.
alter table public.lesson_plans
  add column if not exists plan_date date,
  add column if not exists class_size integer check (class_size is null or class_size >= 0),
  add column if not exists average_age numeric(4,1) check (average_age is null or average_age between 1 and 100),
  add column if not exists time_from time,
  add column if not exists time_to time,
  add column if not exists duration text not null default '',
  add column if not exists lesson_stages jsonb not null default '{}'::jsonb,
  add column if not exists references_text text not null default '';

create table if not exists public.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete set null,
  session_id uuid not null references public.academic_sessions(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  topic text not null check (char_length(trim(topic)) between 1 and 200),
  file_name text not null,
  storage_path text not null unique,
  file_size integer not null check (file_size > 0 and file_size < 1048576),
  status text not null default 'submitted' check (status in ('submitted','approved','revision_requested')),
  review_comment text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lesson_notes_staff_created_idx on public.lesson_notes(staff_id, created_at desc);
create index if not exists lesson_notes_status_created_idx on public.lesson_notes(status, created_at desc);
alter table public.lesson_notes enable row level security;
grant select, insert, update on public.lesson_notes to authenticated;
create policy "Lesson notes select by role" on public.lesson_notes for select to authenticated
using ((select is_admin()) or ((select is_active_user()) and staff_id in (select s.id from public.staff s where s.profile_id=(select auth.uid()) and s.status='active')));
create policy "Lesson notes insert by assigned staff" on public.lesson_notes for insert to authenticated
with check ((select is_active_user()) and status='submitted'
and staff_id in (select s.id from public.staff s where s.profile_id=(select auth.uid()) and s.status='active')
and exists(select 1 from public.teaching_assignments ta where ta.staff_id=lesson_notes.staff_id and ta.class_id=lesson_notes.class_id and ta.session_id=lesson_notes.session_id and ta.subject_id is not distinct from lesson_notes.subject_id)
and exists(select 1 from public.terms t where t.id=lesson_notes.term_id and t.session_id=lesson_notes.session_id));
create policy "Lesson notes admin review" on public.lesson_notes for update to authenticated using ((select is_admin())) with check ((select is_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lesson-notes','lesson-notes',false,1048575,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=1048575,allowed_mime_types=array['application/pdf'];
create policy "Lesson note files readable by owner or admin" on storage.objects for select to authenticated
using(bucket_id='lesson-notes' and ((select is_admin()) or (storage.foldername(name))[1]=(select auth.uid())::text));
create policy "Staff upload own lesson note files" on storage.objects for insert to authenticated
with check(bucket_id='lesson-notes' and (storage.foldername(name))[1]=(select auth.uid())::text and (select is_active_user()));
create policy "Staff delete own lesson note files or admin" on storage.objects for delete to authenticated
using(bucket_id='lesson-notes' and ((select is_admin()) or (storage.foldername(name))[1]=(select auth.uid())::text));
