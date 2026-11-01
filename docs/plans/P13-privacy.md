# P13 개인정보·손님 데이터 (계획)

## 원칙
- 손님 정보의 처리자는 각 샵, 겨울파트너는 수탁자. 샵 간 분리는 RLS(`shop_id`)로 강제.
- 강습 진행에 필요한 정보(이름, 연락처/보호자 연락처, 강습 일시, 레벨, 장비 사이즈)는 계약 이행 근거 — 동의 없이 수집, 안내만.
- 동의는 선택 항목(마케팅 수신, 사진·영상)만. 손님 본인(또는 보호자)이 직접 한 동의만 유효. 직원이 체크한 것은 "직원 기록"(무효).
- 14세 미만: 선택 동의는 보호자 동의만 유효.
- 건강 정보는 받지 않음(입력 안내 + 경고 기록).
- 동의마다 시각·방법(qr/link/onsite)·문구 버전·주체(self/guardian/staff).

## 설정값 (`private.app_settings`, 플랫폼 관리자만 수정)
- `consent_recheck_years` = 2
- `customer_retention_seasons` = 3 (시즌 = 11월~다음 해 4월, 마지막 강습 시즌 기준)
- `access_log_retention_years` = 2

## 작업
1. P13-1 `customer_consents`(추가만, 수정 불가) + `customer_consent_state` 뷰(최신 상태·유효·재확인 필요) + `marketing_recipients(shop)`.
   기존 `marketing_consent`/`privacy_consent_at`은 지우지 않고 staff 기록으로 이관, 이후 쓰지 않음.
   `previous_lesson_notes`: 동의 조건 제거, 같은 샵 강습만.
   `create_job`: 새 손님 privacy_consent 무시.
   화면: 체크박스 제거 → 수집·제공 안내 문구. 마케팅은 상태 표시 + 직원 기록 버튼.
2. P13-2 `customers.birth_year`, 14세 미만이면 보호자 이름·연락처 필수(트리거), 유효성 뷰에 보호자 조건.
   손님별 동의 링크(`consent_links`: 토큰 해시, 만료, 1회) → 공개 페이지 `/consent/[token]`.
3. P13-3 샵 셀프 등록 토큰(`registration_links`, 해시 저장·만료·폐기) → 공개 `/join/[token]`.
   서버 액션은 service_role로 `public_register_customer(token, …)`만 호출(토큰이 가리키는 샵에만 쓰고, 아무것도 읽어 돌려주지 않음).
   같은 연락처가 있으면 새 카드를 만들고 `merge_candidate_id`로 표시 → 샵이 확인 후 병합.
   요청 제한: DB 테이블 기반(토큰·IP 해시별 10분 N회).
   QR 인쇄 페이지(서버에서 SVG 생성).
4. P13-4 메모 입력 안내 + 건강 단어 감지(`health_warnings` 기록).
5. P13-5 `access_logs`(추가만, 트리거로 수정·삭제 금지, 2년 보관 정리는 크론 함수), 기록 지점: 손님 상세 열람(연락처), 엑셀, PDF.
6. P13-6 `anonymize_customer`, `purge_expired_customers`(크론), 삭제 요청 버튼(2단계 확인). 샵 탈퇴 절차 문서.
7. P13-7 약관·처리방침·위탁 고지·손님 안내 초안(모두 "초안 — 법률 검토 전") → blocked.
8. P13-8 pgTAP·E2E.
