-- P12-3 다시 적용: 팀 강습 승인 알림에서 팀원(강사)에게는 팀 확정 금액을 보내지 않는다(팀 몫은 팀이 정한다).
-- 금액은 팀 관리자에게 따로 알린다 (team_lesson_approved). 그 밖의 동작은 approve_lesson과 같다.
-- 원래 마이그레이션(20261101223139_team_approve_notice.sql)은 파일 저장이 안 된 채 빈 파일로 적용됐다(P15-4 리허설에서 발견).
create or replace function public.approve_lesson(p_job_id uuid, p_score int, p_memo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
  a public.assignments;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 강습이 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'done' then
    raise exception '완료 보고된 강습만 승인할 수 있습니다' using errcode = '22023';
  end if;
  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception '평가는 1~5점입니다' using errcode = '22023';
  end if;
  select * into a from public.assignments where job_id = j.id for update;

  update public.assignments set approved_at = now(), approved_by = auth.uid() where id = a.id;
  update public.jobs set status = 'approved' where id = j.id;
  if p_score is not null and a.instructor_id is not null then
    insert into public.ratings (job_id, from_role, to_instructor_id, score, memo)
    values (j.id, 'shop_admin', a.instructor_id, p_score, nullif(btrim(p_memo), ''));
  end if;

  insert into public.notifications (user_id, kind, payload)
  select i.user_id, 'lesson_approved',
         case when a.via_shop_id is null then jsonb_build_object('job_id', j.id, 'amount', a.final_rate)
              else jsonb_build_object('job_id', j.id, 'team', true) end
  from public.instructors i where i.id = a.instructor_id;
  insert into public.notifications (user_id, kind, payload)
  select m.user_id, 'team_lesson_approved', jsonb_build_object('job_id', j.id, 'amount', a.final_rate)
  from public.shop_members m where a.via_shop_id is not null and m.shop_id = a.via_shop_id;
end $$;
