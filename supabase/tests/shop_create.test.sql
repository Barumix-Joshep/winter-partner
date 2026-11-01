-- P2-3 샵·강습팀 등록 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002a1', 'reg-shop@t', '{"role":"shop_admin","name":"등록샵"}'),
  ('00000000-0000-0000-0000-0000000002a2', 'reg-inst@t', '{"role":"instructor","name":"등록강사"}');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}', true);

select lives_ok(
  $$select create_shop('lesson_team', '새 강습팀', '000-00-00009', '홍길동', array[1, 2])$$,
  '샵 관리자는 샵을 등록한다');
select is((select status::text from shops where name = '새 강습팀'), 'pending', '새 샵은 승인 대기');
select is((select type::text from shops where name = '새 강습팀'), 'lesson_team', '종류가 저장된다');
select ok(exists(select 1 from shop_members m join shops s on s.id = m.shop_id
                 where s.name = '새 강습팀' and m.user_id = auth.uid() and m.is_owner), '등록한 사람이 owner');
select is((select count(*) from shop_resorts r join shops s on s.id = r.shop_id where s.name = '새 강습팀'), 2::bigint, '영업 스키장이 저장된다');
select throws_ok($$select create_shop('rental_shop', '스키장 없음', null, null, array[]::int[])$$,
  '22023', null, '영업 스키장은 하나 이상');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}', true);
select throws_ok($$select create_shop('rental_shop', '강사가 만든 샵', null, null, array[1])$$,
  '42501', null, '강사는 샵을 등록하지 못한다');

select * from finish();
rollback;
