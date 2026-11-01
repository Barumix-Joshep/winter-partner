-- P3-1 강사 프로필 저장: 기본 정보와 종목·스키장을 한 트랜잭션으로 바꾼다.
-- security invoker라 RLS(본인 행만)가 그대로 적용된다. 자격증 검증 상태·패널티는 건드리지 않는다.
create function public.save_instructor_profile(
  p_level text,
  p_bio text,
  p_base_rate int,
  p_sport_ids int[],
  p_resort_ids int[]
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
begin
  if me is null then
    raise exception '강사만 프로필을 저장할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(array_length(p_sport_ids, 1), 0) = 0 then
    raise exception '종목을 하나 이상 골라 주세요' using errcode = '22023';
  end if;
  if coalesce(array_length(p_resort_ids, 1), 0) = 0 then
    raise exception '활동 스키장을 하나 이상 골라 주세요' using errcode = '22023';
  end if;

  update public.instructors
  set level = nullif(btrim(p_level), ''), bio = nullif(btrim(p_bio), ''), base_rate = p_base_rate
  where id = me;

  delete from public.instructor_sports where instructor_id = me;
  insert into public.instructor_sports (instructor_id, sport_id) select me, s from unnest(p_sport_ids) s on conflict do nothing;

  delete from public.instructor_resorts where instructor_id = me;
  insert into public.instructor_resorts (instructor_id, resort_id) select me, r from unnest(p_resort_ids) r on conflict do nothing;

  return me;
end $$;

revoke execute on function public.save_instructor_profile(text, text, int, int[], int[]) from public, anon;
grant execute on function public.save_instructor_profile(text, text, int, int[], int[]) to authenticated;
