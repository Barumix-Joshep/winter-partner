-- P5-3 완료 보고·강습 노트와 샵 승인
-- 강사: 배정된 강습이 시작된 뒤 완료 보고와 노트(다음 강습 참고)를 남긴다 → jobs.status = done
-- 샵: 보고된 강습을 승인한다 → approved. 승인된 강습이 월 정산 대상이다. 승인하며 1~5점 평가를 남길 수 있다.
create function public.complete_lesson(p_job_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
  j public.jobs;
  a public.assignments;
begin
  select * into a from public.assignments where job_id = p_job_id for update;
  if me is null or a.id is null or a.instructor_id is distinct from me then
    raise exception '내가 맡은 강습이 아닙니다' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id for update;
  if j.status <> 'assigned' or a.completed_at is not null then
    raise exception '완료 보고할 수 없는 상태입니다' using errcode = '22023';
  end if;
  if j.starts_at > now() then
    raise exception '강습이 시작된 뒤에 보고할 수 있습니다' using errcode = '22023';
  end if;

  update public.assignments set completed_at = now(), lesson_note = nullif(btrim(p_note), '') where id = a.id;
  update public.jobs set status = 'done' where id = j.id;
  insert into public.notifications (user_id, kind, payload)
  select m.user_id, 'lesson_completed', jsonb_build_object('job_id', j.id) from public.shop_members m where m.shop_id = j.shop_id;
end $$;

create function public.approve_lesson(p_job_id uuid, p_score int, p_memo text)
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
  select i.user_id, 'lesson_approved', jsonb_build_object('job_id', j.id, 'amount', a.final_rate)
  from public.instructors i where i.id = a.instructor_id;
end $$;

revoke execute on function public.complete_lesson(uuid, text) from public, anon;
revoke execute on function public.approve_lesson(uuid, int, text) from public, anon;
grant execute on function public.complete_lesson(uuid, text) to authenticated;
grant execute on function public.approve_lesson(uuid, int, text) to authenticated;
