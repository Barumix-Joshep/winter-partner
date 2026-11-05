-- P22-7 AI 상담 본사 지표 (/admin/ai 카드). 본사는 상담 표(대화·메시지·피드백)를 RLS로 못 읽는다(설계).
-- 그래서 숫자만 돌려주는 security definer 함수 두 개를 둔다. 본사(private.is_platform_admin())만, 글자 열은 없다(손님 글·연락처·샵 이름 없음).
-- - public.consult_admin_metrics(p_from, p_to): 기간 [p_from, p_to) 전체 샵 합계 한 행
--   · customer_messages: 기간 안 손님 메시지 수
--   · auto_replied: 그중 같은 대화의 바로 다음 메시지가 AI 자동응답(role 'ai', delivery_status 'sent')인 수 → 자동응답률 = auto_replied ÷ customer_messages
--     (AI 답을 보내지 못했거나(skipped·failed) 사장님 연결 안내(system)가 먼저 나간 경우는 자동응답이 아니다)
--   · conversations: 기간 안에 손님 메시지가 있었던 대화 수
--   · escalated_conversations: 그중 기간 안에 사장님 확인 문의(inquiries.conversation_id)가 열린 대화 수 → 에스컬레이션률 = ÷ conversations
--     (AI가 넘긴 것, 연락처를 받아 넘긴 것, 요청 제한으로 넘긴 것 모두 포함. 한 대화에 문의가 여러 번 열려도 1개)
--   · replied_conversations, first_reply_avg_sec, first_reply_median_sec: 대화마다 기간 안 첫 손님 메시지 뒤 첫 응답
--     (AI 자동응답 보냄 또는 사장님 답장(보내지 못함 failed 제외))까지 걸린 초. 응답이 없는 대화는 평균·중앙값에서 뺀다
--   · feedback_wrong, feedback_edited: 기간 안 사장님 피드백(ai_feedback.kind) 수
-- - public.consult_admin_shop_costs(p_from, p_to): 샵별 AI 상담(ai_usage.feature 'consult') 호출 수·실패 수·비용,
--   한국 하루 기준 최대 호출 수와 상한(ai_consult_daily_calls_per_shop)에 닿은 날 수. 샵 이름은 화면이 shops에서 따로 읽는다.
-- - 기간은 1~400일만(그 밖은 22023). 데이터 변경 없음(함수만).
--
-- 되돌리기:
--   drop function public.consult_admin_metrics(timestamptz, timestamptz), public.consult_admin_shop_costs(timestamptz, timestamptz);

create function private.consult_metric_range_ok(p_from timestamptz, p_to timestamptz) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception '기간은 1~400일로 골라 주세요' using errcode = '22023';
  end if;
end $$;
revoke execute on function private.consult_metric_range_ok(timestamptz, timestamptz) from public, anon;

create function public.consult_admin_metrics(p_from timestamptz, p_to timestamptz)
returns table (
  customer_messages int, auto_replied int, conversations int, escalated_conversations int,
  replied_conversations int, first_reply_avg_sec numeric, first_reply_median_sec numeric,
  feedback_wrong int, feedback_edited int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.consult_metric_range_ok(p_from, p_to);
  return query
  with seq as (
    -- 다음 메시지를 보려면 기간 끝 뒤 메시지도 필요하다(기간 끝 직전 손님 메시지의 답)
    select m.conversation_id, m.role, m.sent_at,
           lead(m.role) over w as next_role, lead(m.delivery_status) over w as next_delivery
    from public.messages m
    where m.sent_at >= p_from
    window w as (partition by m.conversation_id order by m.sent_at, (m.role <> 'customer'), m.id)
  ),
  cust as (
    select * from seq where role = 'customer' and sent_at < p_to
  ),
  convs as (
    select c.conversation_id, min(c.sent_at) as first_at from cust c group by c.conversation_id
  ),
  first_reply as (
    select v.conversation_id,
           extract(epoch from (
             select min(r.sent_at) from public.messages r
             where r.conversation_id = v.conversation_id and r.sent_at >= v.first_at
               and ((r.role = 'ai' and r.delivery_status = 'sent') or (r.role = 'owner' and r.delivery_status <> 'failed'))
           ) - v.first_at)::numeric as sec
    from convs v
  ),
  esc as (
    select count(distinct i.conversation_id)::int as n
    from public.inquiries i join convs v on v.conversation_id = i.conversation_id
    where i.created_at >= p_from and i.created_at < p_to
  ),
  fb as (
    select count(*) filter (where f.kind = 'wrong')::int as wrong, count(*) filter (where f.kind = 'edited')::int as edited
    from public.ai_feedback f where f.created_at >= p_from and f.created_at < p_to
  )
  select (select count(*)::int from cust),
         (select count(*)::int from cust where next_role = 'ai' and next_delivery = 'sent'),
         (select count(*)::int from convs),
         (select n from esc),
         (select count(sec)::int from first_reply),
         (select round(avg(sec), 1) from first_reply),
         (select round(percentile_cont(0.5) within group (order by sec)::numeric, 1) from first_reply where sec is not null),
         fb.wrong, fb.edited
  from fb;
end $$;
revoke execute on function public.consult_admin_metrics(timestamptz, timestamptz) from public, anon;
grant execute on function public.consult_admin_metrics(timestamptz, timestamptz) to authenticated;

create function public.consult_admin_shop_costs(p_from timestamptz, p_to timestamptz)
returns table (shop_id uuid, calls int, failed int, cost_krw numeric, max_day_calls int, cap_days int, daily_cap int)
language plpgsql stable security definer set search_path = '' as $$
declare cap int := private.setting_int('ai_consult_daily_calls_per_shop');
begin
  perform private.consult_metric_range_ok(p_from, p_to);
  return query
  with daily as (
    select u.shop_id, (u.created_at at time zone 'Asia/Seoul')::date as d,
           count(*)::int as n, count(*) filter (where not u.ok)::int as f, sum(u.cost_krw) as c
    from public.ai_usage u
    where u.feature = 'consult' and u.shop_id is not null and u.created_at >= p_from and u.created_at < p_to
    group by 1, 2
  )
  select dl.shop_id, sum(dl.n)::int, sum(dl.f)::int, round(sum(dl.c), 1), max(dl.n)::int,
         count(*) filter (where dl.n >= cap)::int, cap
  from daily dl group by dl.shop_id order by 4 desc, 2 desc;
end $$;
revoke execute on function public.consult_admin_shop_costs(timestamptz, timestamptz) from public, anon;
grant execute on function public.consult_admin_shop_costs(timestamptz, timestamptz) to authenticated;
