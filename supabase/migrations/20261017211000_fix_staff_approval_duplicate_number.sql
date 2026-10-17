-- Reuse an existing unlinked staff row when approving a pending staff account.
-- This prevents a duplicate staff_no constraint error when a school record already exists.
create or replace function public.approve_portal_registration(
  p_profile_id uuid,
  p_record_number text,
  p_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target public.profiles%rowtype;
  clean_number text := nullif(trim(coalesce(p_record_number, '')), '');
  name_parts text[];
  first_part text;
  last_part text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an active administrator can approve registrations' using errcode = '42501';
  end if;
  if clean_number is null then
    raise exception 'A school admission/staff number is required';
  end if;

  select * into target
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then raise exception 'Registration was not found'; end if;
  if target.is_active or target.role not in ('pending_student', 'pending_staff') then
    raise exception 'This account is not awaiting approval';
  end if;

  if target.role = 'pending_student' then
    name_parts := regexp_split_to_array(trim(target.full_name), '\\s+');
    first_part := coalesce(name_parts[1], '');
    last_part := nullif(array_to_string(name_parts[2:array_length(name_parts, 1)], ' '), '');
    if first_part = '' then raise exception 'Student name is required'; end if;

    insert into public.students (profile_id, admission_no, first_name, last_name, status)
    values (target.id, clean_number, first_part, coalesce(last_part, first_part), 'active');
    update public.profiles set role = 'student', is_active = true, updated_at = now()
    where id = target.id;
  else
    update public.staff
      set profile_id = target.id,
          full_name = target.full_name,
          job_title = coalesce(nullif(trim(coalesce(p_job_title, '')), ''), job_title),
          status = 'active'
      where staff_no = clean_number and profile_id is null;

    if not found then
      if exists (select 1 from public.staff where staff_no = clean_number) then
        raise exception 'This staff number is already linked to another staff record. Use the existing record or enter a different authorised staff number.';
      end if;
      insert into public.staff (profile_id, staff_no, full_name, job_title, status)
      values (target.id, clean_number, target.full_name, nullif(trim(coalesce(p_job_title, '')), ''), 'active');
    end if;

    update public.profiles set role = 'staff', is_active = true, updated_at = now()
    where id = target.id;
  end if;

  return jsonb_build_object('id', target.id, 'role',
    case when target.role = 'pending_student' then 'student' else 'staff' end,
    'is_active', true);
end;
$function$;
revoke all on function public.approve_portal_registration(uuid, text, text) from public, anon;
grant execute on function public.approve_portal_registration(uuid, text, text) to authenticated;
