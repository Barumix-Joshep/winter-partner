-- 보안 10(남용 방지): 상대에게 알림이 가는 쓰기와 파일 올리기에 사용자별 횟수 제한.
--   입찰·재입찰(bids insert, amount 변경 — place_bid·place_team_bid마다 샵에 알림) : 10분에 limit_bids_per_10min(기본 30)
--   강습 의뢰(job_offers insert — 강사에게 알림)                                    : 1시간에 limit_offers_per_hour(기본 100)
--   자격증 파일(certs 버킷, 강사 폴더)                                               : 폴더당 limit_cert_files(기본 30)개
-- 서비스 키·시스템 작업(auth.uid() 없음)은 세지 않는다. 횟수는 기존 private.rate_limits(공개 페이지 요청 제한과 같은 표)에 키 해시 없이 "종류:user id"로.
-- 데이터 변경 없음.
--
-- 되돌리기: drop trigger limit_bids on bids; drop trigger limit_job_offers on job_offers;
--   drop function private.limit_bids(); drop function private.limit_job_offers(); drop function private.hit_write_limit(text, int, int);
--   drop policy certs_owner_insert on storage.objects; drop function private.cert_folder_has_room(text);
--   create policy certs_owner_insert on storage.objects for insert to authenticated
--     with check (bucket_id = 'certs' and (storage.foldername(name))[1] = private.my_instructor_id()::text);  (20261101150600_certs.sql)

-- 이번 창에서 기준을 넘으면 예외. 로그인 사용자가 없으면(서비스 키·트리거 안 시스템 쓰기) 통과
create function private.hit_write_limit(p_kind text, p_max int, p_window_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  if uid is null then return; end if;
  insert into private.rate_limits (key, window_start, hits) values ('write:' || p_kind || ':' || uid, w, 1)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into n;
  if n > p_max then
    raise exception '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;
end $$;
revoke all on function private.hit_write_limit(text, int, int) from public, anon, authenticated;

create function private.limit_bids() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.amount is distinct from old.amount then
    perform private.hit_write_limit('bid', coalesce(private.setting_int('limit_bids_per_10min'), 30), 600);
  end if;
  return new;
end $$;
create trigger limit_bids before insert or update of amount on public.bids
  for each row execute function private.limit_bids();

create function private.limit_job_offers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.hit_write_limit('offer', coalesce(private.setting_int('limit_offers_per_hour'), 100), 3600);
  return new;
end $$;
create trigger limit_job_offers before insert on public.job_offers
  for each row execute function private.limit_job_offers();

-- 강사 폴더에 파일이 상한보다 적은가 (RLS와 상관없이 센다)
create function private.cert_folder_has_room(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < coalesce(private.setting_int('limit_cert_files'), 30)
  from storage.objects o
  where o.bucket_id = 'certs' and (storage.foldername(o.name))[1] = (storage.foldername(p_name))[1];
$$;
revoke all on function private.cert_folder_has_room(text) from public, anon;
grant execute on function private.cert_folder_has_room(text) to authenticated;

drop policy certs_owner_insert on storage.objects;
create policy certs_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certs'
              and (storage.foldername(name))[1] = private.my_instructor_id()::text
              and private.cert_folder_has_room(name));
