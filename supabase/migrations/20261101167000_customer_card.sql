-- P7-1 손님 카드: 샵 메모와 보호자 이름. 마케팅 수신 동의 시각은 트리거로 남긴다.
alter table customers add column memo text;
alter table customers add column guardian_name text;

create function private.track_consent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.marketing_consent and (tg_op = 'INSERT' or not old.marketing_consent) then
    new.consent_at := now();
  elsif not new.marketing_consent then
    new.consent_at := null;
  end if;
  return new;
end $$;

create trigger track_consent before insert or update of marketing_consent on customers
  for each row execute function private.track_consent();
