// P23-3 본사 AI 상담 사용권 화면: 표 계산(상태·남은 일수·비율·1건당 비용·필터)과 버튼 입력 해석.
import { describe, expect, it } from "vitest";
import {
  applyFilters,
  costPerResponse,
  endingSoon,
  historyLabel,
  kstDateInput,
  licenseRow,
  parseAddPack,
  parseCreatePlan,
  parseExtend,
  parseFilters,
  parseGrant,
  parseSetPaid,
  parseSetQuota,
  parseSuspend,
  rpcErrorMessage,
  statusLabel,
  usageRatio,
  type OverviewRow,
} from "./license-admin";

const NOW = Date.parse("2026-11-15T03:00:00Z"); // 11/15 12:00 KST
const SHOP = "b0000000-0000-0000-0000-000000000009";

const base: OverviewRow = {
  shop_id: SHOP,
  plan_code: "standard_v1",
  status: "trial",
  state: "ok",
  suspended_reason: null,
  start_mode: "first_auto_reply",
  starts_at: "2026-11-10T05:00:00Z",
  ends_at: "2026-11-19T15:00:00Z", // 11/20 0시 KST → 마지막 날 11/19
  wait_until: null,
  included: 2000,
  pack_responses: 0,
  used: 0,
  auto_replies: 0,
  calls: 0,
  fails: 0,
  cost_krw: 0,
  daily_max: 0,
  daily_cap: 300,
  kakao_on: false,
  instagram_on: false,
  auto_reply_on: false,
  updated_by: null,
  updated_at: null,
  admin_note: null,
};
const none: OverviewRow = { ...base, plan_code: null, status: null, state: "no_license", start_mode: null, starts_at: null, ends_at: null, included: null };

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

describe("상태 이름", () => {
  it("사용권 없음 / 체험 대기 / 체험 / 유료 / 중지 + 이유", () => {
    expect(statusLabel(none).text).toBe("사용권 없음");
    expect(statusLabel({ ...base, starts_at: null, ends_at: null, wait_until: "2026-11-24T00:00:00Z" }).text).toBe("체험 대기");
    expect(statusLabel(base).text).toBe("체험");
    expect(statusLabel({ ...base, status: "paid" }).text).toBe("유료");
    expect(statusLabel({ ...base, status: "suspended", state: "suspended", suspended_reason: "unpaid" }).text).toBe("중지 · 미납");
    expect(statusLabel({ ...base, status: "suspended", state: "suspended", suspended_reason: "admin" }).text).toBe("중지 · 본사");
    expect(statusLabel({ ...base, status: "suspended", state: "suspended", suspended_reason: "terminated" }).text).toBe("중지 · 해지");
    expect(statusLabel({ ...base, status: "suspended", state: "suspended", suspended_reason: "trial_ended" }).text).toBe("중지 · 체험 끝");
  });
  it("정리 작업 전이라도 끝난 것·시작 전인 것은 그렇게 보인다", () => {
    expect(statusLabel({ ...base, state: "expired" }).text).toBe("체험 · 기간 끝남");
    expect(statusLabel({ ...base, status: "paid", state: "not_started" }).text).toBe("유료 · 시작 전");
  });
});

describe("행 계산 (한국 날짜)", () => {
  it("시작일·마지막 날·남은 일수(오늘 포함)", () => {
    const r = licenseRow(base, NOW);
    expect(r.start).toBe("2026-11-10");
    expect(r.end).toBe("2026-11-19");
    expect(r.daysLeft).toBe(5); // 15·16·17·18·19
    expect(r.soon).toBe(true);
  });
  it("체험 대기: 날짜 없음, 대기 끝(부여 + 대기 일수)을 보여 준다", () => {
    const r = licenseRow({ ...base, starts_at: null, ends_at: null, wait_until: "2026-11-23T15:00:00Z" }, NOW);
    expect(r.start).toBe("—");
    expect(r.end).toBe("—");
    expect(r.daysLeft).toBeNull();
    expect(r.waitUntil).toBe("2026-11-24");
  });
  it("7일 이하만 강조, 중지·끝난 것은 강조하지 않음", () => {
    expect(endingSoon({ ...base, ends_at: "2026-11-21T15:00:00Z" }, NOW)).toBe(true); // 22일 0시 → 7일 남음
    expect(endingSoon({ ...base, ends_at: "2026-11-22T15:00:00Z" }, NOW)).toBe(false); // 8일
    expect(endingSoon({ ...base, status: "suspended", state: "suspended", suspended_reason: "admin" }, NOW)).toBe(false);
    expect(endingSoon({ ...base, state: "expired", ends_at: "2026-11-14T15:00:00Z" }, NOW)).toBe(false);
    expect(endingSoon(none, NOW)).toBe(false);
  });
  it("한도 = 포함량 + 그 달 팩", () => {
    const r = licenseRow({ ...base, included: 2000, pack_responses: 1000, used: 2400 }, NOW);
    expect(r.limit).toBe(3000);
    expect(r.ratio).toEqual({ percent: 80, level: "warn" });
  });
});

describe("비율·1건당 비용", () => {
  it("80% 이상 경고, 100% 이상 가득, 막대는 100에서 멈춤", () => {
    expect(usageRatio(0, 2000)).toEqual({ percent: 0, level: "ok" });
    expect(usageRatio(1599, 2000)).toEqual({ percent: 80, level: "ok" }); // 79.95% → 반올림 80이지만 80% 미만
    expect(usageRatio(1600, 2000)).toEqual({ percent: 80, level: "warn" });
    expect(usageRatio(2500, 2000)).toEqual({ percent: 100, level: "full" });
    expect(usageRatio(10, null)).toEqual({ percent: 0, level: "ok" });
  });
  it("응답 0건이면 —, 아니면 원 단위(소수 한 자리)", () => {
    expect(costPerResponse(0, 0)).toBe("—");
    expect(costPerResponse(120, 0)).toBe("—");
    expect(costPerResponse(1234, 100)).toBe("12.3원");
    expect(costPerResponse("2500", 10)).toBe("250원");
  });
});

describe("필터 (주소의 값)", () => {
  const rows: OverviewRow[] = [
    none,
    { ...base, shop_id: "w", starts_at: null, ends_at: null, wait_until: "2026-11-24T00:00:00Z" },
    { ...base, shop_id: "t" }, // 5일 남음
    { ...base, shop_id: "p", status: "paid", ends_at: "2026-12-31T15:00:00Z", used: 1800 }, // 90%
    { ...base, shop_id: "s", status: "suspended", state: "suspended", suspended_reason: "admin" },
  ];
  it("잘못된 값은 무시", () => {
    expect(parseFilters({ status: "nope", soon: "x", over80: "1", month: "2026-11" }, NOW)).toEqual({ status: "all", soon: false, over80: true, month: "2026-11" });
    expect(parseFilters({ month: "2099-01" }, NOW).month).toBe("2026-11");
  });
  it("상태·7일 안에 끝남·80% 넘음", () => {
    const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(rows, f, NOW).map((r) => r.shop_id);
    const all = { status: "all", soon: false, over80: false, month: "2026-11" } as const;
    expect(ids(all)).toHaveLength(5);
    expect(ids({ ...all, status: "none" })).toEqual([SHOP]);
    expect(ids({ ...all, status: "waiting" })).toEqual(["w"]);
    expect(ids({ ...all, status: "trial" })).toEqual(["t"]); // 체험 대기는 따로
    expect(ids({ ...all, status: "paid" })).toEqual(["p"]);
    expect(ids({ ...all, status: "suspended" })).toEqual(["s"]);
    expect(ids({ ...all, soon: true })).toEqual(["t"]);
    expect(ids({ ...all, over80: true })).toEqual(["p"]);
  });
});

describe("버튼 입력 해석", () => {
  it("날짜 입력값 ↔ 한국 날짜 0시", () => {
    expect(kstDateInput("2026-11-20T00:00:00+09:00")).toBe("2026-11-20");
  });
  it("체험 부여: 첫 자동응답(기본) / 날짜 지정", () => {
    expect(parseGrant(fd({ shop_id: SHOP }))).toEqual({ ok: true, args: { p_shop_id: SHOP, p_mode: "first_auto_reply", p_starts_at: null, p_plan_id: null, p_note: null } });
    expect(parseGrant(fd({ shop_id: SHOP, mode: "fixed", starts_on: "2026-12-01", note: " 시범 " }))).toEqual({
      ok: true,
      args: { p_shop_id: SHOP, p_mode: "fixed", p_starts_at: "2026-11-30T15:00:00.000Z", p_plan_id: null, p_note: "시범" },
    });
    expect(parseGrant(fd({ shop_id: SHOP, mode: "fixed" }))).toEqual({ ok: false, message: "시작일을 넣어 주세요." });
    expect(parseGrant(fd({ shop_id: "x" })).ok).toBe(false);
    expect(parseGrant(fd({ shop_id: SHOP, note: "가".repeat(501) }))).toEqual({ ok: false, message: "메모는 500자까지 적어 주세요." });
  });
  it("유료 전환: 청구 기간(마지막 날 포함), 종료일은 시작일 뒤", () => {
    expect(parseSetPaid(fd({ shop_id: SHOP, starts_on: "2026-12-01", ends_on: "2026-12-31", note: "12월분" }))).toEqual({
      ok: true,
      args: { p_shop_id: SHOP, p_starts_at: "2026-11-30T15:00:00.000Z", p_ends_at: "2026-12-31T15:00:00.000Z", p_note: "12월분" },
    });
    expect(parseSetPaid(fd({ shop_id: SHOP, starts_on: "2026-12-31", ends_on: "2026-12-01" }))).toEqual({ ok: false, message: "종료일은 시작일과 같거나 뒤로 넣어 주세요." });
  });
  it("연장: 새 마지막 날 → 다음 날 0시(KST)", () => {
    expect(parseExtend(fd({ shop_id: SHOP, ends_on: "2026-11-30" }))).toEqual({ ok: true, args: { p_shop_id: SHOP, p_ends_at: "2026-11-30T15:00:00.000Z", p_note: null } });
    expect(parseExtend(fd({ shop_id: SHOP, ends_on: "11/30" })).ok).toBe(false);
  });
  it("중지: 이유는 본사·미납·해지, 확인 단계를 거쳐야 한다", () => {
    expect(parseSuspend(fd({ shop_id: SHOP, reason: "unpaid", confirm: "yes" }))).toEqual({ ok: true, args: { p_shop_id: SHOP, p_reason: "unpaid", p_note: null } });
    expect(parseSuspend(fd({ shop_id: SHOP, reason: "trial_ended", confirm: "yes" })).ok).toBe(false);
    expect(parseSuspend(fd({ shop_id: SHOP, reason: "admin" }))).toEqual({ ok: false, message: "중지 확인을 한 번 더 눌러 주세요." });
  });
  it("팩 추가: 이번 달·다음 달만, 1~20개", () => {
    expect(parseAddPack(fd({ shop_id: SHOP, month: "2026-12", count: "2" }), NOW)).toEqual({ ok: true, args: { p_shop_id: SHOP, p_month: "2026-12", p_count: 2 } });
    expect(parseAddPack(fd({ shop_id: SHOP, month: "2026-10", count: "1" }), NOW)).toEqual({ ok: false, message: "팩은 이번 달·다음 달만 넣을 수 있습니다." });
    expect(parseAddPack(fd({ shop_id: SHOP, month: "2026-11", count: "21" }), NOW).ok).toBe(false);
    expect(parseAddPack(fd({ shop_id: SHOP, month: "2026-11", count: "1.5" }), NOW).ok).toBe(false);
  });
  it("포함량·하루 상한: 빈 상한은 기본값(null)", () => {
    expect(parseSetQuota(fd({ shop_id: SHOP, included: "3000", daily_cap: "" }))).toEqual({ ok: true, args: { p_shop_id: SHOP, p_included: 3000, p_daily_cap: null } });
    expect(parseSetQuota(fd({ shop_id: SHOP, included: "3,000", daily_cap: "500" }))).toEqual({ ok: true, args: { p_shop_id: SHOP, p_included: 3000, p_daily_cap: 500 } });
    expect(parseSetQuota(fd({ shop_id: SHOP, included: "0", daily_cap: "" })).ok).toBe(false);
    expect(parseSetQuota(fd({ shop_id: SHOP, included: "10", daily_cap: "10001" })).ok).toBe(false);
  });
  it("새 요금제: 코드 형식·숫자 범위, 옛 요금제 끄기", () => {
    const ok = {
      code: "standard_v2", name: "AI 상담 기본", monthly_price_krw: "69,000", included: "2500", overage_policy: "block",
      pack_size: "1000", pack_price_krw: "19000", trial_days: "10", trial_wait_days: "14", expiry_notice_days: "3", retire_plan_id: SHOP,
    };
    expect(parseCreatePlan(fd(ok))).toEqual({
      ok: true,
      args: {
        p_code: "standard_v2", p_name: "AI 상담 기본", p_monthly_price_krw: 69000, p_included: 2500, p_overage_policy: "block",
        p_pack_size: 1000, p_pack_price_krw: 19000, p_trial_days: 10, p_trial_wait_days: 14, p_expiry_notice_days: 3, p_retire_plan_id: SHOP,
      },
    });
    expect(parseCreatePlan(fd({ ...ok, retire_plan_id: "" })).ok && (parseCreatePlan(fd({ ...ok, retire_plan_id: "" })) as { args: { p_retire_plan_id: unknown } }).args.p_retire_plan_id).toBeNull();
    expect(parseCreatePlan(fd({ ...ok, code: "Standard V2" })).ok).toBe(false);
    expect(parseCreatePlan(fd({ ...ok, overage_policy: "maybe" })).ok).toBe(false);
    expect(parseCreatePlan(fd({ ...ok, trial_days: "91" })).ok).toBe(false);
  });
});

describe("DB 오류 → 한국어 안내", () => {
  it("RPC가 올린 한국어 문구는 그대로, 그 밖은 일반 문구", () => {
    expect(rpcErrorMessage({ code: "23505", message: "이미 사용권이 있습니다. 연장·유료 전환을 써 주세요" })).toBe("이미 사용권이 있습니다. 연장·유료 전환을 써 주세요");
    expect(rpcErrorMessage({ code: "42501", message: "플랫폼 관리자만 할 수 있습니다" })).toBe("플랫폼 관리자만 할 수 있습니다");
    expect(rpcErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "consult_plans_code_key"' })).toBe("이미 있는 요금제 코드입니다.");
    expect(rpcErrorMessage({ code: "23514", message: 'new row violates check constraint "x"' })).toBe("입력한 값의 범위를 확인해 주세요.");
    expect(rpcErrorMessage({ code: "XX000", message: "boom" })).toBe("처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  });
});

describe("이력 이름", () => {
  it("consult_* 동작 이름", () => {
    expect(historyLabel("consult_license_granted")).toBe("체험 부여");
    expect(historyLabel("consult_pack_added")).toBe("팩 추가");
    expect(historyLabel("consult_something_new")).toBe("consult_something_new");
  });
});
