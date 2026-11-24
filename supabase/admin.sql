-- Carry — owner-only admin tools. Run after schema.sql (and photos.sql). Safe to re-run.
-- Who is an admin lives in public.admins (no API access at all; only these functions read it).
-- Every admin change goes through a security-definer function below that checks private.is_admin()
-- and writes a row to public.admin_audit. Admins get read-only RLS access to leagues/members/scores/photos;
-- they never get a direct write policy, so there is no way to change data without leaving an audit row.
-- Add an admin (SQL editor):  insert into public.admins(user_id, note) select id, 'owner' from auth.users where email = 'you@example.com';

create table if not exists public.admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  note     text,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;  -- no policies: invisible over the API

create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  admin_id    uuid references auth.users(id) on delete set null,
  admin_email text,
  action      text not null,
  league_id   uuid,
  target      text,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on public.admin_audit(at desc);
create index if not exists admin_audit_admin_idx on public.admin_audit(admin_id);
alter table public.admin_audit enable row level security;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

drop policy if exists "admins read audit" on public.admin_audit;
create policy "admins read audit" on public.admin_audit for select to authenticated using ((select private.is_admin()));

-- read-only visibility of every league for admins (writes still go through the audited functions)
drop policy if exists "admins read leagues" on public.leagues;
create policy "admins read leagues" on public.leagues for select to authenticated using ((select private.is_admin()));
drop policy if exists "admins read members" on public.members;
create policy "admins read members" on public.members for select to authenticated using ((select private.is_admin()));
drop policy if exists "admins read scores" on public.scores;
create policy "admins read scores" on public.scores for select to authenticated using ((select private.is_admin()));
drop policy if exists "carry admins read cards" on storage.objects;
create policy "carry admins read cards" on storage.objects for select to authenticated
  using (bucket_id = 'scorecards' and (select private.is_admin()));

create or replace function private.audit(p_action text, p_league uuid, p_target text, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit(admin_id, admin_email, action, league_id, target, detail)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_league, p_target, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function private.audit(text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
end $$;
revoke all on function private.require_admin() from public, anon, authenticated;

-- ---------- reads ----------
create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_admin(); $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'leagues', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'season', l.data->>'season', 'invite_code', l.invite_code,
        'owner', l.owner, 'owner_email', (select email from auth.users u where u.id = l.owner),
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'players', coalesce(jsonb_array_length(l.data->'players'), 0),
        'weeks', coalesce(jsonb_array_length(l.data->'weeks'), 0),
        'seasons', coalesce(jsonb_array_length(l.data->'archive'), 0),
        'members', (select count(*) from public.members m where m.league_id = l.id),
        'cards', (select count(*) from public.scores s where s.league_id = l.id),
        'pending', (select count(*) from public.scores s where s.league_id = l.id and s.status = 'pending')
      ) order by l.updated_at desc) from public.leagues l), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'confirmed', u.email_confirmed_at is not null,
        'has_password', coalesce(u.encrypted_password, '') <> '',
        'providers', coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb),
        'admin', exists (select 1 from public.admins a where a.user_id = u.id),
        'leagues', coalesce((select jsonb_agg(jsonb_build_object('id', m.league_id, 'name', l.name, 'role', m.role, 'player_id', m.player_id))
                              from public.members m join public.leagues l on l.id = m.league_id where m.user_id = u.id), '[]'::jsonb)
      ) order by u.created_at desc) from auth.users u), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from (select * from public.admin_audit order by at desc limit 100) a), '[]'::jsonb)
  );
end $$;

-- ---------- sign-up fixes ----------
create or replace function public.admin_confirm_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  perform private.require_admin();
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user returning email into e;
  if e is null then raise exception 'No such user'; end if;
  perform private.audit('confirm_user', null, e, jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.admin_delete_user(p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  perform private.require_admin();
  if p_user = auth.uid() then raise exception 'You can''t delete your own account here'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'That account is an admin'; end if;
  if exists (select 1 from public.leagues where owner = p_user) then raise exception 'That account owns a league. Move or delete the league first.'; end if;
  select email into e from auth.users where id = p_user;
  if e is null then raise exception 'No such user'; end if;
  perform private.audit('delete_user', null, e, jsonb_build_object('user_id', p_user, 'reason', p_reason,
    'leagues', (select coalesce(jsonb_agg(league_id), '[]'::jsonb) from public.members where user_id = p_user)));
  delete from auth.users where id = p_user;
end $$;

create or replace function public.admin_add_member(p_league uuid, p_email text, p_role text default 'player') returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform private.require_admin();
  if p_role not in ('player', 'commissioner') then raise exception 'Role must be player or commissioner'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email yet. Ask them to sign up first.'; end if;
  if not exists (select 1 from public.leagues where id = p_league) then raise exception 'No such league'; end if;
  insert into public.members(league_id, user_id, role, email) values (p_league, uid, p_role, lower(trim(p_email)))
    on conflict (league_id, user_id) do update set role = excluded.role;
  perform private.audit('add_member', p_league, lower(trim(p_email)), jsonb_build_object('user_id', uid, 'role', p_role));
end $$;

create or replace function public.admin_set_member(p_league uuid, p_user uuid, p_role text, p_player text default null, p_remove boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  perform private.require_admin();
  select to_jsonb(m) into before from public.members m where league_id = p_league and user_id = p_user;
  if before is null then raise exception 'Not a member of that league'; end if;
  if p_remove then
    delete from public.members where league_id = p_league and user_id = p_user;
  else
    if p_role not in ('player', 'commissioner') then raise exception 'Role must be player or commissioner'; end if;
    update public.members set role = p_role, player_id = nullif(p_player, '') where league_id = p_league and user_id = p_user;
  end if;
  perform private.audit(case when p_remove then 'remove_member' else 'set_member' end, p_league, before->>'email',
    jsonb_build_object('user_id', p_user, 'before', before, 'role', p_role, 'player_id', p_player));
end $$;

-- ---------- score and handicap corrections ----------
create or replace function public.admin_set_score(p_league uuid, p_week text, p_key text, p_holes smallint[], p_status text default 'approved', p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  perform private.require_admin();
  if p_status not in ('pending', 'approved') then raise exception 'Bad status'; end if;
  if array_length(p_holes, 1) <> 9 or exists (select 1 from unnest(p_holes) h where h is null or h < 1 or h > 20) then raise exception 'A card is 9 hole scores from 1 to 20'; end if;
  if not exists (select 1 from public.leagues l, jsonb_array_elements(l.data->'weeks') w where l.id = p_league and w->>'id' = p_week) then raise exception 'No such week'; end if;
  select jsonb_build_object('holes', holes, 'status', status) into before from public.scores where league_id = p_league and week_id = p_week and player_key = p_key;
  insert into public.scores(league_id, week_id, player_key, holes, status) values (p_league, p_week, p_key, p_holes, p_status)
    on conflict (league_id, week_id, player_key) do update set holes = excluded.holes, status = excluded.status;
  perform private.audit('set_score', p_league, p_key, jsonb_build_object('week', p_week, 'before', before, 'after', jsonb_build_object('holes', p_holes, 'status', p_status), 'reason', p_reason));
end $$;

create or replace function public.admin_delete_score(p_league uuid, p_week text, p_key text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object('holes', holes, 'status', status, 'photo', photo_path) into before from public.scores where league_id = p_league and week_id = p_week and player_key = p_key;
  if before is null then raise exception 'No such card'; end if;
  delete from public.scores where league_id = p_league and week_id = p_week and player_key = p_key;
  perform private.audit('delete_score', p_league, p_key, jsonb_build_object('week', p_week, 'before', before, 'reason', p_reason));
end $$;

-- Patch one player (regular or saved sub) in the league document. Only these fields: name, startIndex, manualIndex.
create or replace function public.admin_update_player(p_league uuid, p_player text, p_patch jsonb, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare patch jsonb; before jsonb; arr text;
begin
  perform private.require_admin();
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into patch from jsonb_each(coalesce(p_patch, '{}'::jsonb)) as e(k, v)
    where k in ('name', 'startIndex', 'manualIndex');
  if patch = '{}'::jsonb then raise exception 'Nothing to change'; end if;
  if patch ? 'name' and (jsonb_typeof(patch->'name') <> 'string' or char_length(trim(patch->>'name')) not between 1 and 60) then raise exception 'Bad name'; end if;
  if patch ? 'startIndex' and jsonb_typeof(patch->'startIndex') <> 'number' then raise exception 'startIndex must be a number'; end if;
  if patch ? 'manualIndex' and jsonb_typeof(patch->'manualIndex') not in ('number', 'null') then raise exception 'manualIndex must be a number or null'; end if;
  foreach arr in array array['players', 'subPlayers'] loop
    select p into before from public.leagues l, jsonb_array_elements(coalesce(l.data->arr, '[]'::jsonb)) p where l.id = p_league and p->>'id' = p_player;
    if before is not null then
      update public.leagues l set data = jsonb_set(l.data, array[arr], (
        select jsonb_agg(case when p->>'id' = p_player then p || patch else p end order by o)
        from jsonb_array_elements(l.data->arr) with ordinality as t(p, o))) where l.id = p_league;
      perform private.audit('update_player', p_league, p_player, jsonb_build_object('list', arr, 'before', before, 'patch', patch, 'reason', p_reason));
      return;
    end if;
  end loop;
  raise exception 'No such player in that league';
end $$;

revoke all on function public.am_i_admin(), public.admin_overview(), public.admin_confirm_user(uuid), public.admin_delete_user(uuid, text),
  public.admin_add_member(uuid, text, text), public.admin_set_member(uuid, uuid, text, text, boolean),
  public.admin_set_score(uuid, text, text, smallint[], text, text), public.admin_delete_score(uuid, text, text, text),
  public.admin_update_player(uuid, text, jsonb, text) from public, anon;
grant execute on function public.am_i_admin(), public.admin_overview(), public.admin_confirm_user(uuid), public.admin_delete_user(uuid, text),
  public.admin_add_member(uuid, text, text), public.admin_set_member(uuid, uuid, text, text, boolean),
  public.admin_set_score(uuid, text, text, smallint[], text, text), public.admin_delete_score(uuid, text, text, text),
  public.admin_update_player(uuid, text, jsonb, text) to authenticated;

-- Log an admin action that happens outside the database (e.g. sending a password-reset email from the app).
create or replace function public.admin_note(p_action text, p_target text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_action not in ('send_reset', 'open_league') then raise exception 'Unknown action'; end if;
  perform private.audit(p_action, null, left(p_target, 200), p_detail);
end $$;
revoke all on function public.admin_note(text, text, jsonb) from public, anon;
grant execute on function public.admin_note(text, text, jsonb) to authenticated;
