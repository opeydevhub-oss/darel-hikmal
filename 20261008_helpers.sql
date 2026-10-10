-- ===========================================================================
-- Darel Hikmah Portal — server-controlled field helpers & audit (Phase 8/9)
-- Migration: 20261008_helpers
--
-- Defines one small trigger function per protected table so that each
-- function only touches columns that exist on THAT table — this is the fix
-- for the Phase 8 bug ("do not reference OLD during INSERT" / "do not set
-- columns that do not exist on the table").
--
-- Shared helpers:
--   * update_updated_at()             — bumps updated_at on every UPDATE.
--   * audit_log()                     — generic append-only audit trigger.
--   * enforce_attendance_edit_window()— hard 7-day edit guard.
--
-- SECURITY: these functions run as SECURITY DEFINER owned by supabase_admin
-- so auth.uid() resolves to the connected client even under RLS.
-- ===========================================================================

----------------------------------------------------------------------------
-- 1. update_updated_at — generic; bumps updated_at on every UPDATE.
----------------------------------------------------------------------------

create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 2. protect_results() — manages results.entered_by / published_by / published_at
--    * entered_by is set once on INSERT (auth.uid()), immutable afterwards.
--    * published_by / published_at are set ONLY on draft→published; the
--      client flips the status and the trigger stamps the publisher. They
--      can never be set directly by the client and are cleared if the row
--      is reverted to draft.
--    * FIX: during INSERT we only READ auth.uid()/NEW, we never reference OLD.
----------------------------------------------------------------------------

create or replace function protect_results()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    NEW.entered_by := uid;
    return NEW;
  end if;

  if tg_op = 'UPDATE' then
    -- entered_by immutable after insert.
    NEW.entered_by := OLD.entered_by;

    if OLD.status = 'draft' and NEW.status = 'published' then
      NEW.published_by := uid;
      NEW.published_at := now();
    elsif NEW.status = 'draft' then
      -- un-publish
      NEW.published_by := NULL;
      NEW.published_at := NULL;
    else
      -- non-publish transition: preserve existing publish stamps.
      NEW.published_by := OLD.published_by;
      NEW.published_at := OLD.published_at;
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 3. protect_report_cards() — manages published_by / published_at (admin only
--    ever flips a report card to published via UPDATE of status-ish fields;
--    here we guard the two publish columns). entered_at-style columns are
--    not present, so only the publish rule applies.
----------------------------------------------------------------------------

create or replace function protect_report_cards()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    return NEW; -- no actor columns to stamp on insert for report cards
  end if;

  if tg_op = 'UPDATE' then
    if OLD.file_path is null and NEW.file_path is not null then
      NEW.published_by := uid;
      NEW.published_at := now();
    elsif NEW.file_path is null and OLD.file_path is not null then
      NEW.published_by := NULL;
      NEW.published_at := NULL;
    else
      NEW.published_by := OLD.published_by;
      NEW.published_at := OLD.published_at;
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 4. protect_announcements() — created_by set on INSERT from auth.uid()
----------------------------------------------------------------------------

create or replace function protect_announcements()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    NEW.created_by := auth.uid();
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.created_by := OLD.created_by;
    return NEW;
  end if;
  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 5. protect_assignments() & protect_materials() — created_by on INSERT
----------------------------------------------------------------------------

create or replace function protect_assignments()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    NEW.created_by := auth.uid();
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.created_by := OLD.created_by;
    return NEW;
  end if;
  return NEW;
end;
$$;

create or replace function protect_materials()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    NEW.created_by := auth.uid();
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.created_by := OLD.created_by;
    return NEW;
  end if;
  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 6. protect_attendance() — marked_by set on INSERT from auth.uid()
----------------------------------------------------------------------------

create or replace function protect_attendance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    NEW.marked_by := auth.uid();
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.marked_by := OLD.marked_by;
    return NEW;
  end if;
  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 7. protect_payments() — recorded_by set on INSERT from auth.uid()
----------------------------------------------------------------------------

create or replace function protect_payments()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    NEW.recorded_by := auth.uid();
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.recorded_by := OLD.recorded_by;
    return NEW;
  end if;
  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 8. protect_admissions_review() — reviewed_by set only when a staff/admin
--    changes status away from 'submitted'/'under_review'. auth.uid().
----------------------------------------------------------------------------

create or replace function protect_admissions_review()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- admissions are inserted ONLY by the Edge Function with status='submitted'
    -- and reviewed_by NULL. Keep reviewed_by NULL on insert.
    NEW.reviewed_by := NULL;
    return NEW;
  end if;

  if tg_op = 'UPDATE' then
    if OLD.status is distinct from NEW.status then
      -- any status change is a review action → stamp the reviewer
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
    end if;
    NEW.reviewed_by := coalesce(NEW.reviewed_by, OLD.reviewed_by);
    return NEW;
  end if;

  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 9. enforce_attendance_edit_window — hard guard against back-dating edits
----------------------------------------------------------------------------

create or replace function enforce_attendance_edit_window()
returns trigger
language plpgsql
as $$
declare
  role portal_role;
begin
  if tg_op = 'UPDATE' and OLD.session_date < (current_date - interval '7 days') then
    select p.role into role from profiles p where p.id = auth.uid();
    if role is distinct from 'staff' and role is distinct from 'admin' then
      raise exception 'attendance older than 7 days can only be edited by staff or admin';
    end if;
  end if;
  return NEW;
end;
$$;

----------------------------------------------------------------------------
-- 10. audit_log() — generic append-only audit trigger
--     Inserts the whole changed row as jsonb. audit_log has no client INSERT
--     policy and is owned by supabase_admin, so only this trigger / the
--     service role can write it.
----------------------------------------------------------------------------

create or replace function audit_log()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
begin
  if TG_OP = 'DELETE' then
    insert into audit_log (table_name, record_id, action, actor_profile_id,
                           changed_by, old_data, new_data)
    values (TG_TABLE_NAME, old.id::text, 'delete', uid, uid, row_to_json(old), NULL);
    return old;
  end if;

  if TG_OP = 'INSERT' then
    insert into audit_log (table_name, record_id, action, actor_profile_id,
                           changed_by, old_data, new_data)
    values (TG_TABLE_NAME, new.id::text, 'insert', uid, uid, NULL, row_to_json(new));
    return new;
  end if;

  -- UPDATE
  insert into audit_log (table_name, record_id, action, actor_profile_id,
                         changed_by, old_data, new_data)
  values (TG_TABLE_NAME, new.id::text, 'update', uid, uid,
          row_to_json(old), row_to_json(new));
  return new;
end;
$$;
