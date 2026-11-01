-- P5-2 강사 가능 일정: 한 주(최대 8일 창)를 통째로 바꾼다. 화면이 시간대 칸을 합친 범위를 넘긴다.
create function public.set_week_availability(p_from timestamptz, p_to timestamptz, p_ranges jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
  r jsonb;
  s timestamptz;
  e timestamptz;
begin
  if me is null then
    raise exception '강사만 일정을 저장할 수 있습니다' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '8 days' then
    raise exception '한 번에 한 주까지 저장할 수 있습니다' using errcode = '22023';
  end if;

  delete from public.availability where instructor_id = me and starts_at >= p_from and ends_at <= p_to;
  for r in select * from jsonb_array_elements(coalesce(p_ranges, '[]'::jsonb)) loop
    s := (r ->> 'starts')::timestamptz;
    e := (r ->> 'ends')::timestamptz;
    if s < p_from or e > p_to or e <= s then
      raise exception '그 주 안의 시간만 넣을 수 있습니다' using errcode = '22023';
    end if;
    insert into public.availability (instructor_id, starts_at, ends_at) values (me, s, e);
  end loop;
end $$;

revoke execute on function public.set_week_availability(timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.set_week_availability(timestamptz, timestamptz, jsonb) to authenticated;
