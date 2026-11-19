-- Live RLS checks: paste into Supabase SQL Editor. Needs three confirmed users with these emails (or edit them). Runs in a transaction and rolls back.
begin;
create temp table _r(msg text) on commit drop;
grant all on _r to authenticated;
do $$
declare c uuid; d uuid; e uuid; lid uuid; code text; n int;
begin
  select id into c from auth.users where email = 'carry.e2e+commish@example.com';
  select id into d from auth.users where email = 'carry.e2e+dee@example.com';
  select id into e from auth.users where email = 'carry.e2e+sam@example.com';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  lid := public.create_league('RLS Live Test', '{"players":[{"id":"p1","name":"Comm"},{"id":"p2","name":"Dee"}],"weeks":[{"id":"w1"}]}');
  select invite_code into code from public.leagues where id = lid;
  insert into public.scores(league_id, week_id, player_key, holes, status) values (lid, 'w1', 'p1', '{4,4,3,5,4,4,3,5,4}', 'approved');
  insert into _r values ('commissioner create + approved score OK');

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  select count(*) into n from public.leagues where id = lid; if n <> 0 then raise exception 'outsider sees league'; end if;
  select count(*) into n from public.scores where league_id = lid; if n <> 0 then raise exception 'outsider sees scores'; end if;
  begin insert into public.scores(league_id, week_id, player_key, holes) values (lid, 'w1', 'p2', '{4,4,3,5,4,4,3,5,4}'); raise exception 'X outsider insert';
  exception when insufficient_privilege or check_violation then insert into _r values ('outsider blocked OK'); end;

  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  if public.join_league(lower(code), 'Dee') <> lid then raise exception 'join failed'; end if;
  begin insert into public.scores(league_id, week_id, player_key, holes, status) values (lid, 'w1', 'p2', '{4,4,3,5,4,4,3,5,4}', 'pending'); raise exception 'X unclaimed write';
  exception when insufficient_privilege or check_violation then insert into _r values ('unclaimed write blocked OK'); end;
  perform public.claim_player(lid, 'p2');
  insert into public.scores(league_id, week_id, player_key, holes, status, entered_by) values (lid, 'w1', 'p2', '{5,4,3,5,4,4,3,5,4}', 'pending', c);
  select count(*) into n from public.scores where league_id = lid and player_key = 'p2' and entered_by = d; if n <> 1 then raise exception 'entered_by spoofable'; end if;
  insert into _r values ('own pending card OK, entered_by cannot be spoofed');
  begin update public.scores set status = 'approved' where league_id = lid and player_key = 'p2'; raise exception 'X self-approve';
  exception when insufficient_privilege or check_violation then insert into _r values ('self-approve blocked OK'); end;
  update public.scores set holes = '{1,1,1,1,1,1,1,1,1}' where league_id = lid and player_key = 'p1'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'edited other card'; end if;
  update public.leagues set name = 'hacked' where id = lid; get diagnostics n = row_count; if n <> 0 then raise exception 'player edited league'; end if;
  update public.members set role = 'commissioner' where league_id = lid and user_id = d; get diagnostics n = row_count; if n <> 0 then raise exception 'player promoted self'; end if;
  insert into _r values ('edit other card / league / self-promote blocked OK');
  begin perform public.claim_player(lid, 'p1'); raise exception 'X switch';
  exception when raise_exception then if sqlerrm like 'X %' then raise; end if; insert into _r values ('switch player blocked OK'); end;
  begin perform public.regenerate_invite(lid); raise exception 'X regen';
  exception when raise_exception then if sqlerrm like 'X %' then raise; end if; insert into _r values ('player regenerate invite blocked OK'); end;
  begin perform private.is_member(lid); insert into _r values ('private helper callable in SQL (expected, not via API)'); exception when others then insert into _r values ('private helper: ' || sqlerrm); end;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  update public.scores set status = 'approved' where league_id = lid and player_key = 'p2'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'commissioner approve failed'; end if;
  insert into _r values ('commissioner approve OK');
  reset role;
end $$;
select * from _r;
rollback;
