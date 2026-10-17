-- Restore SELECT privileges required by parent and student dashboards.
-- Existing RLS policies still scope each user's visible rows.
grant select on table public.parents to authenticated;
grant select on table public.parent_students to authenticated;
grant select on table public.results to authenticated;
