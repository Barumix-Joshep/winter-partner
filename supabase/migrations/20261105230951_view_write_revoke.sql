-- 보안 7(DB, P21-11 긴급 P1): public 스키마의 모든 뷰에서 anon·authenticated·public의 쓰기 권한을 회수한다. 읽기(select)는 그대로.
--
-- 원인: Supabase 기본 권한(ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated)이 뷰를 만들 때
--   anon·authenticated에 INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER를 직접 준다.
--   20261102151000_access_hardening.sql은 `revoke all … from public, anon` + `grant select … to authenticated`만 해서
--   authenticated에 직접 준 쓰기 권한이 남았다. instructor_assignments는 소유자 권한으로 도는 뷰(security_invoker 아님)라
--   뷰를 통한 쓰기는 assignments의 RLS를 건너뛴다.
-- 영향(로컬에서 확인): 강사가 뷰로 자기 미승인 배정을 DELETE(취소·벌점·알림·감사 흐름을 모두 건너뜀),
--   팀원이 표 RLS로는 못 건드리는 팀 강습 행을 DELETE하거나 completed_at·lesson_note를 고칠 수 있었다.
--   승인된 배정 삭제·다른 열 변경은 트리거가, 금액 열 변경·INSERT는 뷰 정의(CASE 열)·not null 제약이 막고 있었다.
--   customer_consent_state(security_invoker, DISTINCT ON이라 자동 갱신 불가)는 실제 쓰기는 안 됐지만 권한은 같이 회수한다.
--   앱 화면은 두 뷰를 읽기만 한다(src/app/instructor/*, 손님 동의 표시). 데이터 변경 없음.
-- 앞으로: 새 뷰도 기본 권한 때문에 같은 상태로 만들어진다. supabase/tests/view_grants.test.sql이 CI에서 잡는다.
--
-- 되돌리기(필요할 때만 — 쓰기 구멍이 다시 열린다):
--   grant insert, update, delete, truncate, references, trigger on public.instructor_assignments to authenticated;
--   grant insert, update, delete, truncate, references, trigger on public.customer_consent_state to anon, authenticated;

do $$
declare v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated', v.relname);
  end loop;
end $$;
