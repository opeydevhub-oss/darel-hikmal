create or replace function public.set_lesson_note_review_metadata()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status is distinct from new.status and (select is_admin()) then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;
revoke all on function public.set_lesson_note_review_metadata() from public, anon, authenticated;
create trigger lesson_notes_review_metadata before update on public.lesson_notes
for each row execute function public.set_lesson_note_review_metadata();
