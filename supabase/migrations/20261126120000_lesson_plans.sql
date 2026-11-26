-- Darel Hikmah International Academy
-- Lesson notes and weekly lesson-plan workflow.
-- Staff can save drafts and submit plans for admin review. Admins can approve
-- or return a plan for revision. No existing school records are altered.

create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete set null,
  session_id uuid not null references public.academic_sessions(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  week_start date not null,
  week_end date not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  topic text not null check (char_length(trim(topic)) between 1 and 160),
  subtopic text not null default '',
  learning_objectives text not null,
  previous_knowledge text not null default '',
  instructional_materials text not null default '',
  introduction text not null default '',
  lesson_development text not null,
  teacher_activities text not null default '',
  learner_activities text not null default '',
  evaluation text not null default '',
  assignment text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'revision_requested')),
  review_comment text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_plans_week_range_check check (week_end >= week_start)
);

create index lesson_plans_staff_created_idx
  on public.lesson_plans (staff_id, created_at desc);
create index lesson_plans_status_created_idx
  on public.lesson_plans (status, created_at desc);
create index lesson_plans_class_session_idx
  on public.lesson_plans (class_id, session_id, term_id);
create index lesson_plans_subject_idx on public.lesson_plans (subject_id);
create index lesson_plans_session_idx on public.lesson_plans (session_id);
create index lesson_plans_term_idx on public.lesson_plans (term_id);
create index lesson_plans_reviewed_by_idx on public.lesson_plans (reviewed_by);

alter table public.lesson_plans enable row level security;

grant select, insert, update, delete
  on public.lesson_plans to authenticated;

create or replace function public.guard_lesson_plan_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_staff_id uuid;
begin
  if tg_op = 'INSERT' then
    if not is_admin() then
      select s.id
        into v_staff_id
        from public.staff s
       where s.profile_id = (select auth.uid())
         and s.status = 'active'
       limit 1;

      if v_staff_id is null then
        raise exception 'An active staff record is required to create a lesson plan';
      end if;

      new.staff_id := v_staff_id;

      if new.status not in ('draft', 'submitted') then
        raise exception 'Staff can only create a draft or submit a lesson plan';
      end if;
    elsif new.staff_id is null then
      raise exception 'A staff member is required for this lesson plan';
    end if;

    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_comment := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.staff_id := old.staff_id;

    if is_admin() then
      if old.status is distinct from new.status then
        new.reviewed_by := (select auth.uid());
        new.reviewed_at := now();
      else
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
      end if;
      return new;
    end if;

    if old.status not in ('draft', 'revision_requested') then
      raise exception 'Only draft or returned lesson plans can be edited';
    end if;

    if new.status not in ('draft', 'submitted') then
      raise exception 'Staff can only save a draft or submit a lesson plan';
    end if;

    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.set_lesson_plan_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.guard_lesson_plan_changes() from public, anon, authenticated;
revoke all on function public.set_lesson_plan_updated_at() from public, anon, authenticated;

create trigger lesson_plans_guard
before insert or update on public.lesson_plans
for each row execute function public.guard_lesson_plan_changes();

create trigger lesson_plans_updated_at
before update on public.lesson_plans
for each row execute function public.set_lesson_plan_updated_at();

create policy "Lesson plan access by role"
  on public.lesson_plans
  for select
  to authenticated
  using (
    (select is_admin())
    or (
      (select is_active_user())
      and staff_id in (
        select s.id from public.staff s
         where s.profile_id = (select auth.uid())
           and s.status = 'active'
      )
    )
  );

create policy "Lesson plan inserts by role"
  on public.lesson_plans
  for insert
  to authenticated
  with check (
    (select is_admin())
    or (
      (select is_active_user())
      and status in ('draft', 'submitted')
      and staff_id in (
        select s.id from public.staff s
         where s.profile_id = (select auth.uid())
           and s.status = 'active'
      )
      and exists (
        select 1
          from public.teaching_assignments ta
         where ta.staff_id = lesson_plans.staff_id
           and ta.class_id = lesson_plans.class_id
           and ta.session_id = lesson_plans.session_id
           and ta.subject_id is not distinct from lesson_plans.subject_id
      )
      and exists (
        select 1
          from public.terms t
         where t.id = lesson_plans.term_id
           and t.session_id = lesson_plans.session_id
      )
    )
  );

create policy "Lesson plan updates by role"
  on public.lesson_plans
  for update
  to authenticated
  using (
    (select is_admin())
    or (
      (select is_active_user())
      and status in ('draft', 'revision_requested')
      and staff_id in (
        select s.id from public.staff s
         where s.profile_id = (select auth.uid())
           and s.status = 'active'
      )
    )
  )
  with check (
    (select is_admin())
    or (
      (select is_active_user())
      and status in ('draft', 'submitted')
      and staff_id in (
        select s.id from public.staff s
         where s.profile_id = (select auth.uid())
           and s.status = 'active'
      )
      and exists (
        select 1
          from public.teaching_assignments ta
         where ta.staff_id = lesson_plans.staff_id
           and ta.class_id = lesson_plans.class_id
           and ta.session_id = lesson_plans.session_id
           and ta.subject_id is not distinct from lesson_plans.subject_id
      )
      and exists (
        select 1
          from public.terms t
         where t.id = lesson_plans.term_id
           and t.session_id = lesson_plans.session_id
      )
    )
  );

create policy "Lesson plan deletes by role"
  on public.lesson_plans
  for delete
  to authenticated
  using (
    (select is_admin())
    or (
      (select is_active_user())
      and status = 'draft'
      and staff_id in (
        select s.id from public.staff s
         where s.profile_id = (select auth.uid())
           and s.status = 'active'
      )
    )
  );
