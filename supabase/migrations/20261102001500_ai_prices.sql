-- AI 단가를 공식 단가표(claude.com/pricing, 2026-11-02 확인)로 바꾸고 월 상한을 정한다.
-- 단가(USD/100만 토큰): Haiku 5.5 입력 0.10·출력 0.50 (프롬프트 10만 토큰 이하), Sonnet 5.5 입력 2·출력 10.
-- 원화는 1달러 = 1,450원으로 넉넉히 잡는다(환율이 오르면 이 값을 고친다).
-- 월 상한: 사장님 기준 "프로젝트 전체 월 10만 원 이하". 앱 상한은 8만 원으로 두고,
-- 나머지는 테스트·평가 실행과 환율·추정 오차 여유분. 최종 안전장치는 Anthropic 콘솔의 월 사용 한도.
update private.app_settings
set value = '{"claude-haiku-5-5":{"in":145,"out":725},"claude-sonnet-5-5":{"in":2900,"out":14500}}',
    note = '모델별 100만 토큰당 단가(원). 공식 단가 × 1,450원/달러 (2026-11-02 확인)'
where key = 'ai_prices_krw_per_mtok';

update private.app_settings
set value = '80000', note = '앱 AI 월 비용 상한(원). 프로젝트 전체 목표 10만 원 이하 — 콘솔 한도와 함께 관리'
where key = 'ai_monthly_cap_krw';

insert into private.app_settings (key, value, note) values
  ('ai_krw_per_usd', '1450', '단가 환산 환율(참고용, 단가를 바꿀 때 함께 고친다)')
on conflict (key) do nothing;
