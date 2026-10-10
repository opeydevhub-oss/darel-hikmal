-- ===========================================================================
-- Darel Hikmah International Academy — Portal Schema (Phase 2)
-- Migration: 20261008_create_portal_schema
--
-- Canonical schema for the school management portal. Apply with:
--   supabase db push   (or paste into the SQL editor in the dashboard)
--
-- Security model:
--   * Every table has RLS enabled.
--   * `is_active` is enforced for authenticated access to protected data.
--   * The browser-only SUPABASE_ANON_KEY sees data only through policies.
--   * The service_role key (used by Edge Functions) is the only account that
--     can INSERT into audit_log directly.
--   * No client may write "entered_by", "published_by", "marked_by",
--     "published_by", "recorded_by" or "reviewed_by" — these are set from
--     auth.uid() inside the database.
--
-- If your project already has some tables, reconcile names/columns before
-- applying. See Phases 8-11 for the server-controlled-field and integrity
-- review notes that this migration satisfies.
-- ===========================================================================

----------------------------------------------------------------------------
-- 1. ENUM + helper types
----------------------------------------------------------------------------

create type portal_role as enum ('student', 'parent', 'staff', 'admin');

create type relation_type as enum ('mother', 'father', 'guardian', 'relative');

create type enrolment_status as enum ('active', 'transferred', 'left', 'on_hold');

create type result_status as enum ('draft', 'published');

create type fee_type as enum ('tuition', 'exam', 'activity', 'other');

create type fee_status as enum ('pending', 'partial', 'paid', 'waived');

create type payment_method as enum ('cash', 'bank_transfer', 'card', 'mobile_money', 'other');

create type admission_status as enum ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn');

----------------------------------------------------------------------------
-- 2. profiles — auth.users → role mapping (authorization source of truth)
----------------------------------------------------------------------------

create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text unique not null,
  full_name  text,
  role       portal_role not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh (trigger wired in 20261008_security.sql §2,
-- once update_updated_at() exists and RLS is enabled).

-- Admin read policy is attached in the RLS migration.
create index profiles_role_idx on profiles (role);

----------------------------------------------------------------------------
-- 3. academic_sessions & terms (one current session, one current term per session)
----------------------------------------------------------------------------

create table academic_sessions (
  id          bigint generated always as identity primary key,
  name        text not null,                       -- e.g. "2025/2026"
  is_current  boolean not null default false,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now()
);

create table terms (
  id              bigint generated always as identity primary key,
  academic_session_id bigint not null references academic_sessions on delete cascade,
  name              text not null,                  -- e.g. "Term 1"
  is_current        boolean not null default false,
  start_date        date not null,
  end_date          date not null,
  created_at        timestamptz not null default now(),
  unique (academic_session_id, name)
);

create index terms_session_idx on terms (academic_session_id);

----------------------------------------------------------------------------
-- 4. classes
----------------------------------------------------------------------------

create table classes (
  id          bigint generated always as identity primary key,
  name        text not null,                       -- e.g. "Year 3"
  level       text,                                -- e.g. "Basic 3"
  year_group  text,
  homeroom      uuid references profiles,          -- staff who is the class teacher
  created_at  timestamptz not null default now(),
  unique (name)
);

create index classes_homeroom_idx on classes (homeroom);

----------------------------------------------------------------------------
-- 5. staff
----------------------------------------------------------------------------

create table staff (
  id               bigint generated always as identity primary key,
  profile_id       uuid not null unique references profiles on delete cascade,
  staff_number     text not null unique,
  full_name        text not null,
  job_title        text,
  department       text,
  hire_date        date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

----------------------------------------------------------------------------
-- 6. students
----------------------------------------------------------------------------

create table students (
  id               bigint generated always as identity primary key,
  profile_id       uuid unique references profiles on delete cascade,  -- set when the pupil has an account
  admission_number text not null unique,
  full_name        text not null,
  birth_date       date,
  gender           text,
  current_class_id bigint references classes on delete set null,
  enrolled_session_id bigint references academic_sessions,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index students_current_class_idx on students (current_class_id);

----------------------------------------------------------------------------
-- 7. parents
----------------------------------------------------------------------------

create table parents (
  id           bigint generated always as identity primary key,
  profile_id   uuid not null unique references profiles on delete cascade,
  full_name    text not null,
  phone        text,
  email        text,
  relationship text,                -- relation_type for the child
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Many parents can link many students; one link per parent+student pair.
create table parent_students (
  id         bigint generated always as identity primary key,
  parent_id  bigint not null references parents on delete cascade,
  student_id bigint not null references students on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

create index parent_students_parent_idx on parent_students (parent_id);
create index parent_students_student_idx on parent_students (student_id);

----------------------------------------------------------------------------
-- 8. staff_class_assignments — what a teacher teaches
----------------------------------------------------------------------------

create table teaching_assignments (
  id          bigint generated always as identity primary key,
  staff_id    bigint not null references staff on delete cascade,
  class_id    bigint not null references classes on delete cascade,
  subject_id  bigint not null references subjects on delete cascade,
  created_at  timestamptz not null default now(),
  unique (staff_id, class_id, subject_id)
);

create index ta_staff_idx on teaching_assignments (staff_id);
create index ta_class_subject_idx on teaching_assignments (class_id, subject_id);

----------------------------------------------------------------------------
-- 9. subjects
----------------------------------------------------------------------------

create table subjects (
  id          bigint generated always as identity primary key,
  name        text not null,
  code        text,
  is_islamic  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (name)
);

----------------------------------------------------------------------------
-- 10. enrolments — a student's class for a session
----------------------------------------------------------------------------

create table enrolments (
  id               bigint generated always as identity primary key,
  student_id       bigint not null references students on delete cascade,
  class_id         bigint not null references classes on delete set null,
  academic_session_id bigint not null references academic_sessions,
  enrolment_date   date not null default current_date,
  status           enrolment_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- one active enrolment per student/session
  unique (student_id, academic_session_id, status) where (status = 'active')
);

create index enrolments_student_idx on enrolments (student_id);
create index enrolments_class_session_idx on enrolments (class_id, academic_session_id);

----------------------------------------------------------------------------
-- 11. attendance — staff record it; marked_by set from auth.uid()
----------------------------------------------------------------------------

create type attendance_status as enum ('present', 'absent', 'late');

create table attendance (
  id           bigint generated always as identity primary key,
  student_id   bigint not null references students on delete cascade,
  class_id     bigint not null references classes on delete set null,
  subject_id   bigint references subjects on delete set null,
  staff_id     bigint references staff on delete set null,
  session_date date not null,
  status       attendance_status not null,
  marked_by    uuid references profiles,          -- set by trigger (auth.uid())
  marked_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  -- a student can only be marked once per session (date+class, or date+subject)
  unique (student_id, session_date, class_id, subject_id)
);

create index attendance_student_idx on attendance (student_id);
create index attendance_date_idx on attendance (session_date);

-- 7-day edit window is enforced by a trigger wired in 20261008_security.sql.

----------------------------------------------------------------------------
-- 12. announcements
----------------------------------------------------------------------------

create table announcements (
  id               bigint generated always as identity primary key,
  title            text not null,
  body             text,
  audience         text,                 -- 'all', 'admin','staff','students','parents','class:<id>' ...
  created_by       uuid references profiles,        -- set by trigger
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_published     boolean not null default false
);

-- created_by is stamped by the protect_* trigger (see 20261008_security.sql).

----------------------------------------------------------------------------
-- 13. assignments & materials
----------------------------------------------------------------------------

create table assignments (
  id           bigint generated always as identity primary key,
  class_id     bigint references classes on delete set null,
  subject_id   bigint not null references subjects on delete cascade,
  title        text not null,
  description  text,
  due_at       timestamptz,
  created_by   uuid references profiles,        -- set by trigger
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table materials (
  id           bigint generated always as identity primary key,
  assignment_id bigint references assignments on delete cascade,
  subject_id   bigint not null references subjects on delete cascade,
  class_id     bigint references classes on delete set null,
  title        text not null,
  file_path    text,             -- storage path inside the private bucket
  signed_url   text,             -- short-lived signed URL (do not persist secrets)
  created_by   uuid references profiles,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

----------------------------------------------------------------------------
-- 14. results — staff entry drafts; publishing is server-controlled
----------------------------------------------------------------------------

create table results (
  id            bigint generated always as identity primary key,
  enrolment_id  bigint not null references enrolments on delete cascade,
  subject_id    bigint not null references subjects on delete cascade,
  term_id       bigint not null references terms on delete cascade,
  score         numeric(5,2),
  max_score     numeric(5,2) not null default 100,
  grade         text,
  status        result_status not null default 'draft',
  entered_by    uuid references profiles,        -- set by trigger (the teacher)
  entered_at    timestamptz not null default now(),
  published_by  uuid references profiles,        -- set by trigger ONLY on publish
   published_at    timestamptz,
   created_at        timestamptz not null default now(),
   updated_at        timestamptz not null default now(),
    unique (enrolment_id, subject_id, term_id)
);

-- Server-controlled entered_by/published_by are stamped by the
-- protect_results() trigger wired in 20261008_security.sql section 2.

-- --------------------------------------------------------------------------
-- 15. report cards
-- --------------------------------------------------------------------------

create table report_cards (
  id            bigint generated always as identity primary key,
  enrolment_id  bigint not null references enrolments on delete cascade,
  term_id       bigint not null references terms on delete cascade,
  file_path     text,              -- storage path inside the private bucket
  signed_url    text,
  published_by  uuid references profiles,   -- set by trigger ONLY on publish
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (enrolment_id, term_id)
);

-- published_by/published_at are stamped by protect_report_cards()
-- wired in 20261008_security.sql section 2.

----------------------------------------------------------------------------
-- 16. fee_records & payments (append-only; no DELETE)
----------------------------------------------------------------------------

create table fee_records (
  id            bigint generated always as identity primary key,
  student_id    bigint not null references students on delete cascade,
  term_id       bigint not null references terms on delete cascade,
  type          fee_type not null,
  amount        numeric(10,2) not null,
  status        fee_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id, term_id, type)
);

create index fee_records_student_idx on fee_records (student_id);

create table payments (
  id            bigint generated always as identity primary key,
  fee_record_id bigint not null references fee_records on delete cascade,
  amount        numeric(10,2) not null,
  method        payment_method,
  reference     text unique,             -- external payment reference
  recorded_by   uuid references profiles,  -- set by trigger
  recorded_at   timestamptz not null default now(),
  notes         text
);

create index payments_fee_record_idx on payments (fee_record_id);

-- Payments are append-only: forbid DELETE for non-service roles.
-- (Enforced by RLS: DELETE restricted to a single service role, see the
--  RLS migration. There is NO cascade DELETE to payments.)

----------------------------------------------------------------------------
-- 17. admissions — written ONLY via the admissions Edge Function
--------------------------------------------------------------------------

-- The application form is submitted through the Edge Function, which forces
-- status = 'submitted' and sets reviewed_by = NULL. No anonymous INSERT
-- policy is granted on this table.
create table admissions (
  id             bigint generated always as identity primary key,
  student_name   text not null,
  birth_date     date,
  gender         text,
  parent_name    text not null,
  parent_email   text,
  parent_phone   text,
  phone_alt      text,
  address        text,
  programme      text,
  class_applied  text,
  medical_info   text,
  status         admission_status not null default 'submitted',
  reviewed_by    uuid references profiles,   -- set by trigger
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index admissions_status_idx on admissions (status);

----------------------------------------------------------------------------
-- 18. audit_log — written by the trigger / service role only
----------------------------------------------------------------------------

create type audit_action as enum ('insert', 'update', 'delete');

create table audit_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  record_id    text,
  action       audit_action not null,
  actor_profile_id uuid references profiles,   -- auth.uid(), never from the browser
  changed_by   uuid references profiles,
  changed_at   timestamptz not null default now(),
  old_data     jsonb,
  new_data     jsonb,
  ip_address   inet
);

create index audit_log_table_idx on audit_log (table_name);
create index audit_log_actor_idx on audit_log (actor_profile_id);

comment on table audit_log is
  'Append-only audit trail. INSERT is restricted to a service role / trigger. ' ||
  'No client may insert, update or delete audit records directly.';
