-- Portal registration roles must remain inactive until an authorised admin approves them.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array[
    'student'::text, 'parent'::text, 'staff'::text, 'admin'::text,
    'pending_student'::text, 'pending_staff'::text
  ]));

create or replace function public.handle_new_portal_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  requested_type text;
  assigned_role text;
  clean_name text;
  clean_phone text;
begin
  requested_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'student'));
  if requested_type not in ('student', 'staff') then
    requested_type := 'student';
  end if;

  clean_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if clean_name is null then
    clean_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Portal User');
  end if;
  clean_phone := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  assigned_role := case when requested_type = 'staff' then 'pending_staff' else 'pending_student' end;

  insert into public.profiles (id, email, full_name, phone, role, is_active)
  values (new.id, new.email, clean_name, clean_phone, assigned_role, false)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone = coalesce(public.profiles.phone, excluded.phone),
        role = case when public.profiles.role = 'admin' then 'admin' else excluded.role end,
        is_active = case when public.profiles.role = 'admin' then public.profiles.is_active else false end;

  return new;
end;
$function$;

revoke all on function public.handle_new_portal_user() from public, anon, authenticated;
