-- Carry — Supabase schema with row-level security.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
-- Passes Supabase's security + performance advisors (see README for the one intentional notice).

create extension if not exists pgcrypto with schema extensions;

-- Helpers live in a schema the Data API does not expose.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- tables ----------
create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invite_code text not null unique,
  data        jsonb not null default '{}'::jsonb,   -- players, courses, weeks, settings (no scores)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists leagues_owner_idx on public.leagues(owner);

create table if not exists public.members (
  league_id    uuid not null references public.leagues(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'player' check (role in ('commissioner','player')),
  player_id    text,                       -- claimed roster slot (players[].id in leagues.data)
  display_name text check (char_length(display_name) <= 60),
  email        text,
  joined_at    timestamptz not null default now(),
  primary key (league_id, user_id)
);
create unique index if not exists members_one_claim_per_slot on public.members(league_id, player_id) where player_id is not null;
create index if not exists members_user_idx on public.members(user_id);

create table if not exists public.scores (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  week_id    text not null,
  player_key text not null,                -- player id, or 'sub:<player id>' for a substitute
  holes      smallint[] not null check (array_length(holes, 1) = 9),
  status     text not null default 'pending' check (status in ('pending','approved')),
  entered_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (league_id, week_id, player_key)
);
create index if not exists scores_entered_by_idx on public.scores(entered_by);

-- Clean up the v1 helpers that lived in public (re-run safety).
drop policy if exists "members read league" on public.leagues;
drop policy if exists "commissioner edits league" on public.leagues;
drop policy if exists "members see roster" on public.members;
drop policy if exists "commissioner manages members" on public.members;
drop policy if exists "leave or remove" on public.members;
drop policy if exists "members read scores" on public.scores;
drop policy if exists "write own card or commissioner" on public.scores;
drop policy if exists "update own card or commissioner" on public.scores;
drop policy if exists "commissioner deletes scores" on public.scores;
drop function if exists public.is_member(uuid);
drop function if exists public.is_commissioner(uuid);
drop function if exists public.my_player(uuid);
drop function if exists public.gen_invite_code();

-- ---------- helpers (security definer avoids RLS recursion; not callable over the API) ----------
create or replace function private.is_member(lid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where league_id = lid and user_id = (select auth.uid()));
$$;
create or replace function private.is_commissioner(lid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where league_id = lid and user_id = (select auth.uid()) and role = 'commissioner');
$$;
create or replace function private.my_player(lid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select player_id from public.members where league_id = lid and user_id = (select auth.uid());
$$;
create or replace function private.gen_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; code text := ''; i int;
begin
  for i in 1..6 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
  return code;
end $$;
revoke all on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid), private.is_commissioner(uuid), private.my_player(uuid) to authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
-- scores: stamp who last wrote the card (clients can't spoof entered_by)
create or replace function private.touch_score() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.entered_by := auth.uid(); end if;
  return new;
end $$;
drop function if exists public.touch_updated_at() cascade;
drop trigger if exists leagues_touch on public.leagues;
create trigger leagues_touch before update on public.leagues for each row execute function private.touch_updated_at();
drop trigger if exists scores_touch on public.scores;
create trigger scores_touch before insert or update on public.scores for each row execute function private.touch_score();

-- ---------- RPCs (the only way to create/join a league) ----------
create or replace function public.create_league(p_name text, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare lid uuid; code text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first'; end if;
  loop code := private.gen_invite_code(); exit when not exists (select 1 from public.leagues where invite_code = code); end loop;
  insert into public.leagues(name, owner, invite_code, data) values (p_name, uid, code, coalesce(p_data, '{}'::jsonb)) returning id into lid;
  insert into public.members(league_id, user_id, role, email)
    values (lid, uid, 'commissioner', (select email from auth.users where id = uid));
  return lid;
end $$;

create or replace function public.join_league(p_code text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare lid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select id into lid from public.leagues where invite_code = upper(trim(p_code));
  if lid is null then raise exception 'That invite code does not match any league'; end if;
  insert into public.members(league_id, user_id, role, display_name, email)
    values (lid, uid, 'player', nullif(left(trim(p_display_name), 60), ''), (select email from auth.users where id = uid))
    on conflict (league_id, user_id) do update
      set display_name = coalesce(excluded.display_name, public.members.display_name);
  return lid;
end $$;

create or replace function public.claim_player(p_league uuid, p_player text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if not private.is_member(p_league) then raise exception 'Join the league first'; end if;
  if not exists (select 1 from public.leagues l, jsonb_array_elements(l.data->'players') p
                 where l.id = p_league and p->>'id' = p_player) then
    raise exception 'No such player in this league';
  end if;
  if exists (select 1 from public.members where league_id = p_league and user_id = uid and player_id is not null and player_id <> p_player) then
    raise exception 'You already claimed a player. Ask the commissioner to change it.';
  end if;
  if exists (select 1 from public.members where league_id = p_league and player_id = p_player and user_id <> uid) then
    raise exception 'Someone already claimed that player. Ask the commissioner to reassign it.';
  end if;
  update public.members set player_id = p_player where league_id = p_league and user_id = uid;
end $$;

create or replace function public.regenerate_invite(p_league uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  if not private.is_commissioner(p_league) then raise exception 'Commissioner only'; end if;
  loop code := private.gen_invite_code(); exit when not exists (select 1 from public.leagues where invite_code = code); end loop;
  update public.leagues set invite_code = code where id = p_league;
  return code;
end $$;

revoke all on function public.create_league(text, jsonb), public.join_league(text, text),
  public.claim_player(uuid, text), public.regenerate_invite(uuid) from public, anon;
grant execute on function public.create_league(text, jsonb), public.join_league(text, text),
  public.claim_player(uuid, text), public.regenerate_invite(uuid) to authenticated;

-- ---------- row-level security ----------
alter table public.leagues enable row level security;
alter table public.members enable row level security;
alter table public.scores  enable row level security;
-- signed-out visitors get nothing at all
revoke all on public.leagues, public.members, public.scores from anon;
grant select, update, delete on public.leagues to authenticated;   -- inserts only through create_league()
grant select, update, delete on public.members to authenticated;   -- inserts only through join_league()
grant select, insert, update, delete on public.scores to authenticated;

create policy "members read league" on public.leagues for select to authenticated using (private.is_member(id));
create policy "commissioner edits league" on public.leagues for update to authenticated
  using (private.is_commissioner(id)) with check (private.is_commissioner(id));
drop policy if exists "owner deletes league" on public.leagues;
create policy "owner deletes league" on public.leagues for delete to authenticated using (owner = (select auth.uid()));

create policy "members see roster" on public.members for select to authenticated using (private.is_member(league_id));
create policy "commissioner manages members" on public.members for update to authenticated
  using (private.is_commissioner(league_id)) with check (private.is_commissioner(league_id));
create policy "leave or remove" on public.members for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_commissioner(league_id));

create policy "members read scores" on public.scores for select to authenticated using (private.is_member(league_id));
create policy "write own card or commissioner" on public.scores for insert to authenticated
  with check (private.is_commissioner(league_id) or (player_key = private.my_player(league_id) and status = 'pending'));
create policy "update own card or commissioner" on public.scores for update to authenticated
  using (private.is_commissioner(league_id) or player_key = private.my_player(league_id))
  with check (private.is_commissioner(league_id) or (player_key = private.my_player(league_id) and status = 'pending'));
create policy "commissioner deletes scores" on public.scores for delete to authenticated using (private.is_commissioner(league_id));

-- ---------- realtime (live leaderboards) ----------
alter table public.scores replica identity full;   -- lets realtime filter DELETE events by league_id
do $$ begin
  begin alter publication supabase_realtime add table public.scores;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.leagues; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
end $$;
