-- RLS smoke test (run against a local Postgres with auth stubs; see README "Verifying the schema").
-- C = commissioner, D = player who claims p2, E = outsider.
\set ON_ERROR_STOP 1
grant select, insert, update, delete on all tables in schema public to authenticated;
set role authenticated;

set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
select public.create_league('Test League', '{"players":[{"id":"p1","name":"Comm"},{"id":"p2","name":"Dee"}],"weeks":[{"id":"w1"}]}') as lid \gset
select invite_code as code from leagues where id = :'lid' \gset
insert into scores(league_id, week_id, player_key, holes, status) values (:'lid', 'w1', 'p1', '{4,4,3,5,4,4,3,5,4}', 'approved');
\echo commissioner created league + approved score: OK

set request.jwt.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as outsider_sees_leagues from leagues;   -- expect 0
select count(*) as outsider_sees_scores from scores;     -- expect 0
do $$ begin
  begin insert into scores(league_id, week_id, player_key, holes) select id, 'w1', 'p2', '{4,4,3,5,4,4,3,5,4}' from leagues; 
  exception when others then raise notice 'outsider insert blocked: %', sqlerrm; end;
end $$;

set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
select public.join_league(lower(:'code'), 'Dee') = :'lid'::uuid as joined_ok;
select count(*) as member_sees_scores from scores;        -- expect 1
do $$ begin
  begin insert into scores(league_id, week_id, player_key, holes, status) select id, 'w1', 'p2', '{4,4,3,5,4,4,3,5,4}', 'pending' from leagues;
    raise exception 'should have failed: unclaimed player wrote a card';
  exception when insufficient_privilege or check_violation then raise notice 'unclaimed write blocked: OK'; end;
end $$;
select public.claim_player(:'lid', 'p2');
insert into scores(league_id, week_id, player_key, holes, status) values (:'lid', 'w1', 'p2', '{5,4,3,5,4,4,3,5,4}', 'pending');
\echo player wrote own pending card: OK
do $$ begin
  begin update scores set status = 'approved' where player_key = 'p2'; raise exception 'self-approve should fail';
  exception when insufficient_privilege or check_violation then raise notice 'self-approve blocked: OK'; end;
end $$;
do $$ declare n int; begin
  update scores set holes = '{1,1,1,1,1,1,1,1,1}' where player_key = 'p1'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'player edited someone else''s card'; end if; raise notice 'edit other card blocked: OK';
end $$;
do $$ declare n int; begin
  update leagues set name = 'hacked'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'player edited league'; end if; raise notice 'player league edit blocked: OK';
end $$;
do $$ begin
  begin perform public.claim_player((select id from leagues), 'p1'); raise exception 'should fail';
  exception when raise_exception then if sqlerrm = 'should fail' then raise exception 'switching player was NOT blocked'; end if; raise notice 'switching to another player blocked: OK (%)', sqlerrm; end;
  begin perform public.regenerate_invite((select id from leagues)); raise exception 'should fail';
  exception when raise_exception then if sqlerrm = 'should fail' then raise exception 'player regenerated the invite'; end if; raise notice 'regenerate invite by player blocked: OK (%)', sqlerrm; end;
end $$;

set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
update scores set status = 'approved' where player_key = 'p2';
select player_key, status from scores order by player_key;
\echo ALL RLS CHECKS PASSED
