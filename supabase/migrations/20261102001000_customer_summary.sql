-- P14-6 손님 카드 AI 요약 캐시 (참고용 표시). 서버(service_role)만 쓴다.
-- source_hash: 요약에 쓴 입력(강습 이력·수업 메모·연락 기록·샵 메모)의 지문. 바뀌면 다음에 열 때 다시 만든다.
alter table customers add column ai_summary jsonb;
alter table customers add column ai_summary_at timestamptz;

create function public.save_customer_summary(p_customer_id uuid, p_summary jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.customers set ai_summary = p_summary, ai_summary_at = now() where id = p_customer_id and anonymized_at is null
$$;
revoke execute on function public.save_customer_summary(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_customer_summary(uuid, jsonb) to service_role;

-- 익명화하면 요약도 지운다
create or replace function private.clear_summary_on_anonymize() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.anonymized_at is not null and old.anonymized_at is null then
    new.ai_summary := null;
    new.ai_summary_at := null;
  end if;
  return new;
end $$;
create trigger clear_summary_on_anonymize before update of anonymized_at on customers
  for each row execute function private.clear_summary_on_anonymize();
