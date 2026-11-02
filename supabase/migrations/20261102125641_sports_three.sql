-- P17-1 종목 3개: 스키 / 스노우보드 / 스노우스케이트.
-- 이전 이름: '스노보드' (0002_seed_reference.sql). id는 그대로 두고 이름만 바꾸므로
-- instructor_sports·jobs·customers 등 sport_id 참조는 영향이 없다.
-- 되돌리기: update sports set name = '스노보드' where name = '스노우보드';
--           delete from sports where name = '스노우스케이트' (참조가 없을 때만).
-- 멱등: 이미 바뀌었거나 이미 있으면 아무것도 하지 않는다.
update sports set name = '스노우보드'
where name = '스노보드' and not exists (select 1 from sports where name = '스노우보드');

insert into sports (name) values ('스노우스케이트') on conflict (name) do nothing;
