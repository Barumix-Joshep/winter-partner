-- P14-4 입찰 선정 보조 재료 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- 시드: 용평 알파인샵(shop2) 공고 e..003에 이보드(강사)·평창 라이딩스쿨(팀) 입찰
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select is((select count(*)::int from bid_assist_context('e0000000-0000-0000-0000-000000000003')), 2, '입찰 2건의 재료');
select is((select array_agg(bidder_type order by amount) from bid_assist_context('e0000000-0000-0000-0000-000000000003')), array['instructor', 'shop'], '금액순, 강사·팀');
select is((select certs from bid_assist_context('e0000000-0000-0000-0000-000000000003') where bidder_type = 'instructor'), array['KSIA Level 1'], '검증 자격증');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select throws_ok($$select * from bid_assist_context('e0000000-0000-0000-0000-000000000003')$$, '42501', null, '다른 샵 공고는 못 본다');

select * from finish();
rollback;
