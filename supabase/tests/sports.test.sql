-- P17-1 종목 3개 (pgTAP). 이름만 바꾸고 id·참조는 그대로.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select array_agg(name order by id) from sports), array['스키', '스노우보드', '스노우스케이트'], '종목 3개, 순서 유지');
select is((select id from sports where name = '스노우보드'), 2, '스노우보드는 예전 스노보드 id(2) 그대로');
select is((select count(*) from sports where name = '스노보드'), 0::bigint, '예전 이름은 없다');
select ok((select count(*) from instructor_sports s join sports p on p.id = s.sport_id where p.name = '스노우보드') > 0, '시드 강사의 스노우보드 연결이 남아 있다');

-- 멱등: 마이그레이션 본문을 다시 돌려도 바뀌지 않는다
update sports set name = '스노우보드' where name = '스노보드' and not exists (select 1 from sports where name = '스노우보드');
insert into sports (name) values ('스노우스케이트') on conflict (name) do nothing;
select is((select count(*) from sports), 3::bigint, '다시 돌려도 3개');
select is((select count(*) from sports where name = '스노우스케이트'), 1::bigint, '스노우스케이트 1개');

select * from finish();
rollback;
