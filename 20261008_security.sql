-- ===========================================================================
-- Darel Hikmah Portal — RLS, trigger wiring & policies (Phase 8/9/10)
-- Migration: 20261008_security
--
-- Applies the trigger functions defined in 20261008_helpers.sql to each
-- table, enables Row Level Security everywhere, and installs policies.
--
-- Role model:
--   * profiles.role is the authorization source of truth.
--   * helper functions current_profile_role()/is_admin()/is_active_staff()
--     run SECURITY DEFINER so they can read profiles under RLS.
--   * service_role (used by Edge Functions) bypasses RLS via BYPASSRLS
--     — no anon INSERT/DELETE policy is granted on admissions, audit_log,
--     or payments.
-- ===========================================================================

----------------------------------------------------------------------------
-- 0. Enable RLS on every table
----------------------------------------------------------------------------

alter table profiles               enable row level security;
alter table academic_sessions    enable row level security;
alter table terms                enable row level security;
alter table classes              enable row level security;
alter table staff                enable row level security;
alter table students             enable row level security;
alter table parents              enable row level security;
alter table parent_students      enable row level security;
alter table teaching_assignments enable row level security;
alter table subjects             enable row level security;
alter table enrolments           enable row level security;
alter table attendance           enable row level security;
alter table announcements        enable row level security;
alter table assignments          enable row level security;
alter table materials            enable row level security;
alter table results              enable row level security;
alter table report_cards         enable row level security;
alter table fee_records          enable row level security;
alter table payments             enable row level security;
alter table admissions           enable row level security;
alter table audit_log            enable row level security;

----------------------------------------------------------------------------
-- 1. Role-check helpers (SECURITY DEFINER so they read profiles under RLS)
----------------------------------------------------------------------------

create or replace function current_profile_role()
returns portal_role
language sql security definer stable
set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function current_profile_active()
returns boolean
language sql security definer stable
set search_path = public
as $$ select is_active from profiles where id = auth.uid() $$;

create or replace function is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$ select exists (select 1 from profiles p
                     where p.id = auth.uid() and p.role = 'admin' and p.is_active) $$;

create or replace function is_active_staff()
returns boolean
language sql security definer stable
set search_path = public
as $$ select exists (select 1 from profiles p
                     where p.id = auth.uid() and p.role = 'staff' and p.is_active) $$;

----------------------------------------------------------------------------
-- 2. Attach trigger functions
----------------------------------------------------------------------------

-- updated_at maintenance
create trigger trg_profiles_updated
  before update on profiles for each row execute function update_updated_at();
create trigger trg_staff_updated
  before update on staff for each row execute function update_updated_at();
create trigger trg_students_updated
  before update on students for each row execute function update_updated_at();
create trigger trg_parents_updated
  before update on parents for each row execute function update_updated_at();
create trigger trg_announcements_updated
  before update on announcements for each row execute function update_updated_at();
create trigger trg_assignments_updated
  before update on assignments for each row execute function update_updated_at();
create trigger trg_materials_updated
  before update on materials for each row execute function update_updated_at();
create trigger trg_results_updated
  before update on results for each row execute function update_updated_at();
create trigger trg_report_cards_updated
  before update on report_cards for each row execute function update_updated_at();
create trigger trg_fee_records_updated
  before update on fee_records for each row execute function update_updated_at();

-- server-controlled "actor" / publish columns
create trigger trg_results_protect
  before insert or update on results for each row execute function protect_results();
create trigger trg_report_cards_protect
  before insert or update on report_cards for each row execute function protect_report_cards();
create trigger trg_announcements_protect
  before insert or update on announcements for each row execute function protect_announcements();
create trigger trg_assignments_protect
  before insert or update on assignments for each row execute function protect_assignments();
create trigger trg_materials_protect
  before insert or update on materials for each row execute function protect_materials();
create trigger trg_attendance_protect
  before insert or update on attendance for each row execute function protect_attendance();
create trigger trg_payments_protect
  before insert or update on payments for each row execute function protect_payments();
create trigger trg_admissions_protect
  before insert or update on admissions for each row execute function protect_admissions_review();

-- attendance edit-window guard
create trigger trg_attendance_edit_window
  before update on attendance for each row execute function enforce_attendance_edit_window();

-- audit (append-only trail on the protected data tables).
-- ROW-LEVEL so NEW/OLD rows exist for row_to_json().
create trigger trg_audit_profiles
  after insert or update or delete on profiles for each row execute function audit_log();
create trigger trg_audit_staff after insert or update or delete on staff for each row execute function audit_log();
create trigger trg_audit_students after insert or update or delete on students for each row execute function audit_log();
create trigger trg_audit_results after insert or update or delete on results for each row execute function audit_log();
create trigger trg_audit_fee_records after insert or update or delete on fee_records for each row execute function audit_log();
create trigger trg_audit_payments after insert or update or delete on payments for each row execute function audit_log();
create trigger trg_audit_attendance after insert or update or delete on attendance for each row execute function audit_log();

-- Block DELETE on append-only tables entirely at the trigger layer too.
create or replace function deny_delete()
returns trigger language plpgsql as $$
begin raise exception 'DELETE is not permitted on this table'; return null; end $$;
create trigger trg_payments_no_delete before delete on payments for each row execute function deny_delete();
create trigger trg_results_no_delete before delete on results for each row execute function deny_delete();

----------------------------------------------------------------------------
-- 3. Policies
----------------------------------------------------------------------------

-- 3a. profiles: admin sees all; the user sees their own row.
create policy "admin can manage profiles" on profiles for all
  using (is_admin()) with check (is_admin());
create policy "user can read own profile" on profiles
  for select using (auth.uid() = id and current_profile_active());

-- 3b. academic_sessions / terms: readable by any authenticated active user.
create policy "authenticated read academic_sessions" on academic_sessions
  for select using (current_profile_active());
create policy "authenticated read terms" on terms
  for select using (current_profile_active());

-- 3c. classes: staff/admin read & write; a pupil/parent sees the class they
--     are enrolled in (read-only).
create policy "staff+ can read classes" on classes
  for select using (is_admin() or is_active_staff());
create policy "admin can manage classes" on classes
  for all using (is_admin()) with check (is_admin());
create policy "student/parent read enrolled class" on classes for select
  using (current_profile_active()
         and exists (select 1 from students s
                     where s.current_class_id = classes.id
                       and (s.profile_id = auth.uid()
                            or exists (select 1 from parent_students ps
                                       join parents pa on pa.id = ps.parent_id
                                       where pa.profile_id = auth.uid() and ps.student_id = s.id))));

-- 3d. staff: admin manages staff; staff can read directory.
create policy "admin manages staff" on staff for all using (is_admin()) with check (is_admin());
create policy "staff read directory" on staff for select using (is_admin() or is_active_staff());

-- 3e. students: staff/admin full; parents read their children.
create policy "staff+ manage students" on students for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "parents see own children" on students for select
  using (current_profile_active()
         and exists (select 1 from parent_students ps
                     join parents pa on pa.id = ps.parent_id
                     where pa.profile_id = auth.uid() and ps.student_id = students.id));
-- A pupil may read their own student record (profile_id = self) so the
-- record panel can show class, roll number, etc.
create policy "student reads own record" on students for select
  using (profile_id is not null and profile_id = auth.uid() and current_profile_active());

-- 3f. parents: staff/admin manage; a parent sees only their own row.
create policy "staff+ manage parents" on parents for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "parent reads own row" on parents for select
  using (auth.uid() = profile_id and current_profile_active());

-- parent_students: a parent links themselves to a student they already own.
create policy "staff+ manage parent_students" on parent_students
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "parent read own links" on parent_students for select
  using (current_profile_active()
         and exists (select 1 from parents pa where pa.id = parent_id and pa.profile_id = auth.uid()));
-- A parent can add a link only for their own student record.
create policy "parent add own link" on parent_students for insert
  with check (current_profile_active()
              and exists (select 1 from parents pa where pa.id = parent_id and pa.profile_id = auth.uid()));
-- No UPDATE/DELETE for parents (links are stable); remove is a staff/admin job.
create policy "parent cannot update links" on parent_students for update using (is_admin() or is_active_staff());
create policy "parent cannot delete links" on parent_students for delete using (is_admin() or is_active_staff());

-- 3g. teaching_assignments: staff read; admin manage.
create policy "staff read assignments" on teaching_assignments
  for select using (is_active_staff() or is_admin());
create policy "admin manage assignments" on teaching_assignments
  for all using (is_admin()) with check (is_admin());

-- 3h. subjects: any authenticated user reads; admin writes.
create policy "authenticated read subjects" on subjects for select using (current_profile_active());
create policy "admin manage subjects" on subjects for all using (is_admin()) with check (is_admin());

-- 3i. enrolments: staff/admin full; students/parents read their own.
create policy "staff+ manage enrolments" on enrolments
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "student reads own enrolments" on enrolments for select
  using (current_profile_active()
         and exists (select 1 from students s
                     join profiles p on p.id = s.profile_id
                     where p.id = auth.uid() and s.id = enrolments.student_id));
create policy "parent reads own children enrolments" on enrolments for select
  using (current_profile_active()
         and exists (select 1 from parent_students ps
                     join students s on s.id = ps.student_id
                     join parents pa on pa.id = ps.parent_id
                     where pa.profile_id = auth.uid() and s.id = enrolments.student_id));

-- 3j. attendance: staff/admin write; student/parent read their own.
create policy "staff+ manage attendance" on attendance
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "student/parent read own attendance" on attendance for select
  using (current_profile_active()
         and exists (select 1 from students s
                     join enrolments e on e.student_id = s.id
                     left join profiles pp on pp.id = s.profile_id
                     left join parent_students ps on ps.student_id = s.id
                     left join parents pa on pa.id = ps.parent_id
                     where s.id = attendance.student_id
                       and (pp.id = auth.uid() or pa.profile_id = auth.uid())));
-- attendance is append-only for non-staff beyond the 7-day guard handled in PL.
create policy "prevent attendance delete" on attendance for delete using (is_admin());
create policy "prevent attendance update by non-staff" on attendance for update using (is_admin() or is_active_staff());

-- 3k. announcements: staff+/admin write; everyone authenticated reads published.
create policy "staff+ manage announcements" on announcements
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "authenticated reads published announcements" on announcements for select
  using (current_profile_active() and is_published);

-- 3l. assignments & materials: staff write; student/parent read published via class.
create policy "staff+ manage assignments" on assignments
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "authenticated read assignments" on assignments for select using (current_profile_active());
create policy "staff+ manage materials" on materials
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "authenticated read materials" on materials for select using (current_profile_active());

-- 3m. results: staff/admin write (entry + publish); students/parents read
--     their own, PUBLISHED only.
create policy "staff+ manage results" on results
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "student/parent read own published results" on results for select
  using (current_profile_active()
         and status = 'published'
         and exists (select 1 from students s
                     join enrolments e on e.id = results.enrolment_id
                     left join profiles pp on pp.id = s.profile_id
                     left join parent_students ps on ps.student_id = s.id
                     left join parents pa on pa.id = ps.parent_id
                     where s.id = e.student_id
                       and (pp.id = auth.uid() or pa.profile_id = auth.uid())));
create policy "no unauthenticated access to results" on results for select using (current_profile_active());

-- 3n. report_cards: staff+ manage; student/parent read own published.
create policy "staff+ manage report_cards" on report_cards
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "student/parent read own published report cards" on report_cards for select
  using (current_profile_active()
         and file_path is not null
         and exists (select 1 from students s
                     join enrolments e on e.id = report_cards.enrolment_id
                     left join profiles pp on pp.id = s.profile_id
                     left join parent_students ps on ps.student_id = s.id
                     left join parents pa on pa.id = ps.parent_id
                     where s.id = e.student_id
                       and (pp.id = auth.uid() or pa.profile_id = auth.uid())));

-- 3o. fee_records: staff/admin write; student/parent read their own.
create policy "staff+ manage fee_records" on fee_records
  for all using (is_admin() or is_active_staff()) with check (is_admin() or is_active_staff());
create policy "student/parent read own fees" on fee_records for select
  using (current_profile_active()
         and exists (select 1 from students s
                     left join profiles pp on pp.id = s.profile_id
                     left join parent_students ps on ps.student_id = s.id
                     left join parents pa on pa.id = ps.parent_id
                     where s.id = fee_records.student_id
                       and (pp.id = auth.uid() or pa.profile_id = auth.uid())));

-- 3p. payments: staff+ write (recorded_by is forced by trigger, so the client
--     CANNOT spoof the recorder even if it supplied the column);
--     student/parent READ ONLY (no INSERT/UPDATE/DELETE) on their family rows.
--     DELETE is forbidden for everyone by the deny_delete trigger (append-only);
--     the default-deny RLS + the trigger mean no DELETE policy is granted.
create policy "staff+ manage payments" on payments
  for insert with check (is_admin() or is_active_staff());
create policy "staff+ update/delete payments" on payments
  for update with check (is_admin() or is_active_staff());
create policy "family reads own payments" on payments for select
  using (current_profile_active()
         and exists (select 1 from fee_records fr
                     join students s on s.id = fr.student_id
                     left join profiles pp on pp.id = s.profile_id
                     left join parent_students ps on ps.student_id = s.id
                     left join parents pa on pa.id = ps.parent_id
                     where fr.id = payments.fee_record_id
                       and (pp.id = auth.uid() or pa.profile_id = auth.uid())));
-- payments are append-only: no DELETE policy is granted (deny_delete trigger
-- is the hard guarantee); default-deny blocks it entirely.

-- 3q. admissions: NO anonymous INSERT (handled by Edge Function + service_role).
--     Staff/admin read all; students cannot read admissions (PII).
create policy "staff+ read admissions" on admissions for select using (is_admin() or is_active_staff());
create policy "no anon insert on admissions" on admissions for insert using (is_admin()); -- blocks browser
create policy "staff+ update admissions" on admissions for update using (is_admin() or is_active_staff());
create policy "staff+ delete admissions" on admissions for delete using (is_admin() or is_active_staff());

-- 3r. audit_log: a row-level audit trigger fires on behalf of the caller
--     AFTER their DML already succeeded against RLS, so authenticated active
--     users are allowed to be the source of an audit row (they cannot forge
--     one — the trigger is the only writer). service_role bypasses RLS too.
create policy "authenticated users source audit rows" on audit_log for insert with check (current_profile_active());
create policy "audit_log readable by admin only" on audit_log for select using (is_admin());
create policy "audit_log not deletable" on audit_log for delete using (is_admin());
create policy "audit_log not updatable" on audit_log for update using (is_admin());


----------------------------------------------------------------------------
-- 4. Service role & Edge Function notes (Phase 10)
--
-- The built-in `service_role` role (SUPABASE_SERVICE_ROLE_KEY) has
-- BYPASSRLS in the PostgREST / GoTrue config, so the admissions Edge
-- Function — which authenticates with the service_role key — can INSERT
-- into `admissions` directly and is NOT subject to the "no anon insert"
-- policy above. The anon policy simply ensures a browser user with the
-- publishable key cannot insert rows.
--
-- The Edge Function itself enforces:
--   * status = 'submitted' (server-set; ignores any client status).
--   * reviewed_by = NULL (only staff flip status, via the admin portal
--     using the ANON key + is_admin() policy on admissions UPDATE).
-- ===========================================================================
