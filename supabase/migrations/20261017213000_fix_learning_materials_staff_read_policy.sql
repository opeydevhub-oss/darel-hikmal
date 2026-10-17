-- Allow authenticated users to query learning materials while RLS limits staff
-- to their own uploaded materials and administrators to school-wide records.
grant select on table public.learning_materials to authenticated;

create policy "Staff can view their own learning materials"
on public.learning_materials
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_active_user()
    and uploaded_by in (
      select s.id
      from public.staff s
      where s.profile_id = auth.uid()
        and s.status = 'active'
    )
  )
);
