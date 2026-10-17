-- Restore authenticated read privileges needed by the portal dashboards.
-- Row-level security policies continue to control which rows each user can read.
grant select on table public.subjects to authenticated;
grant select on table public.assignments to authenticated;
grant select on table public.attendance to authenticated;
