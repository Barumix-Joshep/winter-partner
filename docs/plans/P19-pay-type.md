# P19-1 강사별 지급 방식 (전속 원천징수 대비)

## Context

지금은 개인 강사 정산에 모두 사업소득 3.3%를 뗀다(전속도 같음). 전속 강사를 근로자로 대우하는 샵은 근로소득 원천징수·4대보험을 샵이 따로 처리하므로 플랫폼이 3.3%를 떼면 정산서가 틀린다. 사장님이 렌탈샵 대표님들께 확인 중이며, 3.3%로 주는 곳·근로자로 대우하는 곳·둘이 섞인 곳이 모두 있을 수 있다고 보고 설계한다.

**세무 판단은 플랫폼이 하지 않는다.** 플랫폼은 "어떤 방식으로 지급되는지 기록하고 정산서에 표시"까지만 한다. 근로소득 간이세액표·4대보험 계산은 구현하지 않는다. 결과가 오기 전 기본 동작(3.3%)은 바뀌지 않는다.

## 설계

### 값과 저장 위치
- 참조 표 `pay_types(code text pk, label text, withholds boolean, sort int)` — CHECK나 enum 대신 표로 두어 후속 값(예: 근로소득 표시용)을 행 추가로 늘린다.
  - `business_3_3` 사업소득 3.3% (withholds = true) — **기본값**
  - `none_by_shop` 원천징수는 샵이 별도 처리 (withholds = false) — 플랫폼은 총액만 기록하고 원천세 0원
- 지급 방식은 샵과 강사의 관계에 둔다: `shop_instructors.pay_type text not null default 'business_3_3' references pay_types(code)`.
  - 마이그레이션은 기존 행을 모두 기본값으로 채운다(기존 정산 금액 불변).
- 프리랜서(비전속)는 `shop_instructors` 행이 없으므로 항상 `business_3_3`이고 바꿀 곳이 없다. 변경 RPC도 전속 행이 없으면 거부한다.
- 팀 정산(원천세 0%)은 현행 유지. `settlements.pay_type`은 팀이면 null.

### 변경과 이력
- 표 직접 수정은 막혀 있다(P18-3에서 `shop_instructors` 수정 정책 삭제). 변경은 RPC `set_instructor_pay_type(p_shop_id, p_instructor_id, p_pay_type)`만.
  - 그 샵 멤버(샵 관리자)만. 다른 샵·강사·anon 거부(42501).
  - 그 샵 전속이 아니면 거부: "전속 강사만 지급 방식을 바꿀 수 있습니다"(22023).
  - 없는 값 거부(22023).
- 이력 `shop_instructor_pay_type_log(id, shop_id, instructor_id, old_pay_type, new_pay_type, changed_by, changed_at)`. 샵 멤버는 자기 샵 이력을 읽기만, 쓰기는 RPC만.

### 정산 반영 (발행 시점 값 보존)
- `settlements.pay_type text references pay_types(code)` 추가. 기존 개인 강사 정산서는 `business_3_3`, 팀은 null로 채운다.
- `generate_settlements`는 draft를 만들 때 그 시점의 지급 방식을 복사하고 원천세를 그 값으로 계산한다:
  `private.withholding_amount(gross, via_shop_id is null and pay_types.withholds)`.
  - 소득세 3%·지방세 0.3%, 10원 단위 버림, 소득세 1,000원 미만 면제 — 함수 그대로.
- 발행(issued)·지급(paid)된 정산서는 집계가 건드리지 않으므로, 나중에 지급 방식을 바꿔도 소급되지 않는다. draft는 "다시 집계" 때 새 값으로 다시 계산된다(발행 전이라 확정 전).
- 지급 방식은 강습 시점이 아니라 **집계 시점** 값이다. 달 중간에 바꾸면 그 달 전체에 적용된다(화면 안내).

### 화면·정산서
- `/shop/team`(전속 강사): 강사마다 지급 방식 선택(기본 "사업소득 3.3%"), 선택 칸 옆 "세무 확인 후 선택하세요" 안내, 저장 버튼. 최근 변경 이력 한 줄.
- `/shop/settlements`: 행마다 지급 방식 표시, 요약 카드 "원천징수" 문구에서 "3.3%" 고정 표기 제거.
- 정산서 PDF: 정보 줄에 "지급 방식", `none_by_shop`이면 소득세·지방세 줄 대신 "원천세 (샵에서 별도 처리) 0원"과 "원천징수는 샵에서 별도 처리합니다" 문구.
- Excel 요약 시트: "지급 방식" 열 추가.
- 강사 정산 화면 예상치: 정산서가 없을 때 `none_by_shop` 샵이면 원천세 0으로 예상(강사는 자기 전속 행을 읽을 수 있다).
- PDF·Excel·화면 모두 저장된 `gross·withholding·net`을 그대로 쓴다(재계산하지 않음).

### 되돌리기
마이그레이션 주석에 적는다: `generate_settlements`를 20261102150000_settlement_integrity.sql 정의로 되돌리고, `set_instructor_pay_type`·이력 표·`settlements.pay_type`·`shop_instructors.pay_type`·`pay_types`를 지운다. 기존 정산서 금액은 이 마이그레이션이 바꾸지 않으므로 데이터 복구는 필요 없다.

## 테스트
- pgTAP `pay_type`: 기존 전속 기본값, 방식별 금액(3.3%·0원), 비전속 변경 거부, 다른 샵 변경 거부, 없는 값 거부, 이력 기록, 발행 후 변경해도 정산서 불변, 프리랜서는 항상 3.3%, 표 직접 수정 불가.
- 단위: `withholding` 반올림·면제 경계(33,330원 / 33,333원 / 33,340원), `buildStatement` 지급 방식 표시·문구.
- E2E `pay-type.spec.ts`: 전속 2명 중 1명만 `none_by_shop`인 샵의 한 달 정산 → 화면 합계 = Excel 요약 합계 = PDF 금액.
- 회귀: 기존 settlements·settlement_integrity·season 테스트 금액 그대로.

## 문서
`docs/help-shop.md`·`/help`에 "전속 강사 지급 방식" 한 줄(세무사와 확인하세요).
