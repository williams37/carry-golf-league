-- ---------- Scorecard photos (proof for each card) ----------
-- Private bucket; objects live at  <league_id>/<week_id>/<player_key with ':'→'_'>.<webp|jpg>
-- Read: any member of that league.  Write/replace/delete: the league's commissioner, or the player whose card it is.
alter table public.scores add column if not exists photo_path text;
alter table public.scores drop constraint if exists scores_photo_path_shape;
alter table public.scores add constraint scores_photo_path_shape
  check (photo_path is null or photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}/[A-Za-z0-9_-]{1,80}\.(webp|jpg)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scorecards', 'scorecards', false, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- League id from an object path, or null if the path isn't shaped like ours (never throws on bad input).
create or replace function private.card_league(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}/[A-Za-z0-9_-]{1,80}\.(webp|jpg)$'
              then split_part(p, '/', 1)::uuid end;
$$;
create or replace function private.can_read_card(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.is_member(private.card_league(p)), false);
$$;
create or replace function private.can_write_card(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when private.card_league(p) is null then false else
    private.is_commissioner(private.card_league(p))
    or regexp_replace(split_part(p, '/', 3), '\.(webp|jpg)$', '') = replace(coalesce(private.my_player(private.card_league(p)), '-'), ':', '_')
  end;
$$;
revoke all on function private.card_league(text), private.can_read_card(text), private.can_write_card(text) from public, anon;
grant execute on function private.card_league(text), private.can_read_card(text), private.can_write_card(text) to authenticated;

drop policy if exists "carry members read cards" on storage.objects;
drop policy if exists "carry owner uploads card" on storage.objects;
drop policy if exists "carry owner replaces card" on storage.objects;
drop policy if exists "carry owner deletes card" on storage.objects;
create policy "carry members read cards" on storage.objects for select to authenticated
  using (bucket_id = 'scorecards' and private.can_read_card(name));
create policy "carry owner uploads card" on storage.objects for insert to authenticated
  with check (bucket_id = 'scorecards' and private.can_write_card(name));
create policy "carry owner replaces card" on storage.objects for update to authenticated
  using (bucket_id = 'scorecards' and private.can_write_card(name))
  with check (bucket_id = 'scorecards' and private.can_write_card(name));
create policy "carry owner deletes card" on storage.objects for delete to authenticated
  using (bucket_id = 'scorecards' and private.can_write_card(name));

-- A card's photo_path must point inside its own league/week folder (no pointing at someone else's photo).
create or replace function private.check_photo_path() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.league_id::text then
    raise exception 'photo_path must live under the card''s league folder';
  end if;
  return new;
end $$;
drop trigger if exists scores_photo_path on public.scores;
create trigger scores_photo_path before insert or update of photo_path on public.scores for each row execute function private.check_photo_path();
