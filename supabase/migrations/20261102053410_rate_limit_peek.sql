-- P16-3 요청 횟수 제한: 횟수를 늘리지 않고 이번 창이 한도 안인지만 본다.
-- 로그인처럼 "실패한 것만 세는" 제한에 쓴다: 시도 전에 peek, 실패하면 public_rate_limit으로 센다.
create function public.public_rate_peek(p_key text, p_max int, p_window_seconds int)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select hits from private.rate_limits
                   where key = left(p_key, 200)
                     and window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)), 0) < p_max
$$;
revoke execute on function public.public_rate_peek(text, int, int) from public, anon, authenticated;
grant execute on function public.public_rate_peek(text, int, int) to service_role;
