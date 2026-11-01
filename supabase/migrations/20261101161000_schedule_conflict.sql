-- P5-1 배정 시간 충돌: 한 강사가 같은 시간에 두 강습(샵이 달라도)에 배정되지 않게 DB가 막는다.
-- 의뢰 수락·입찰·선정 함수가 미리 확인하지만, 동시에 들어오는 요청과 다른 경로(강습 시간 변경,
-- 취소 되돌리기)까지 막으려고 트리거로 한 번 더 건다. 강사별 advisory lock으로 동시 배정을 줄 세운다.
create function private.guard_assignment_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  if new.instructor_id is null then
    return new;  -- 팀 배정(강사 미정)
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.instructor_id::text, 0));
  select * into j from public.jobs where id = new.job_id;
  if j.status <> 'canceled' and private.has_time_conflict(new.instructor_id, j.starts_at, j.ends_at, j.id) then
    raise exception '같은 시간에 이미 배정된 강습이 있습니다' using errcode = '23P01';
  end if;
  return new;
end $$;

create trigger guard_assignment_overlap before insert or update of instructor_id, job_id on assignments
  for each row execute function private.guard_assignment_overlap();

-- 강습 시간을 바꾸거나 취소를 되돌릴 때
create function private.guard_job_time_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inst uuid;
begin
  if new.status = 'canceled' then
    return new;
  end if;
  select instructor_id into inst from public.assignments where job_id = new.id;
  if inst is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(inst::text, 0));
  if private.has_time_conflict(inst, new.starts_at, new.ends_at, new.id) then
    raise exception '배정된 강사의 다른 강습과 시간이 겹칩니다' using errcode = '23P01';
  end if;
  return new;
end $$;

create trigger guard_job_time_overlap before update of starts_at, ends_at, status on jobs
  for each row
  when (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
        or (old.status = 'canceled' and new.status <> 'canceled'))
  execute function private.guard_job_time_overlap();
