-- 보안 10(남용 방지): 상대에게 알림이 가는 쓰기(입찰·재입찰, 강습 의뢰)와 자격증 파일 올리기에 사용자별 횟수 제한 (pgTAP).
-- 기준값은 private.app_settings(limit_*)라 테스트에서는 작게 바꿔 확인한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into private.app_settings (key, value) values ('limit_bids_per_10min', '2'), ('limit_offers_per_hour', '2'), ('limit_cert_files', '2')
  on conflict (key) do update set value = excluded.value;

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 1~2) 이보드가 공개 입찰 공고에 금액을 거듭 내면(알림이 매번 간다) 기준을 넘는 순간 막힌다
select pg_temp.as_user('a0000000-0000-0000-0000-000000000022');
select lives_ok($$select place_bid('e0000000-0000-0000-0000-000000000003', 70000, null); select place_bid('e0000000-0000-0000-0000-000000000003', 69000, null)$$, '기준 안의 입찰·재입찰은 된다');
select throws_ok($$select place_bid('e0000000-0000-0000-0000-000000000003', 68000, null)$$, 'P0001', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', '기준을 넘으면 막힌다');
reset role;

-- 3~4) 샵이 강습 의뢰를 쏟아내지 못한다 (의뢰마다 강사에게 알림)
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select lives_ok($$insert into job_offers (job_id, instructor_id) values
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000022'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000024')$$, '기준 안의 의뢰는 된다');
select throws_ok($$insert into job_offers (job_id, instructor_id) values ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000022')$$,
  'P0001', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', '기준을 넘으면 막힌다');

-- 5~6) 강사 폴더의 자격증 파일 수 상한 (Storage API로 파일만 계속 올리기 방지)
select pg_temp.as_user('a0000000-0000-0000-0000-000000000023');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('certs', 'c0000000-0000-0000-0000-000000000023/a.pdf'), ('certs', 'c0000000-0000-0000-0000-000000000023/b.pdf')$$, '상한 안에서는 올린다');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('certs', 'c0000000-0000-0000-0000-000000000023/c.pdf')$$, '42501', null, '상한을 넘으면 못 올린다');
reset role;

select * from finish();
rollback;
