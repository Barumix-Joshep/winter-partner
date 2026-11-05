// 정산서 데이터 (PDF·Excel 공통)
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { withholding } from "./withholding";
import { payTypeOf } from "./pay-type";

export const SETTLEMENT_STATUS: Record<string, string> = { draft: "집계됨", issued: "정산서 발행", paid: "지급 완료" };

// supabase select 모양 (src/app/settlements/... 와 src/app/shop/settlements/... 에서 같은 select를 쓴다)
export const SETTLEMENT_SELECT =
  "id, month, gross, withholding, net, status, pay_type, shops!settlements_shop_id_fkey(name, business_no), instructors(profiles(name)), payee:shops!settlements_payee_shop_id_fkey(name), settlement_items(amount, assignments(jobs(starts_at, ends_at, lesson_type, sports(name))))";

export type SettlementRow = {
  id: string;
  month: string;
  gross: number;
  withholding: number;
  net: number;
  status: string;
  pay_type: string | null;
  shops: { name: string; business_no: string | null } | null;
  instructors: { profiles: { name: string } | null } | null;
  payee: { name: string } | null;
  settlement_items: {
    amount: number;
    assignments: { jobs: { starts_at: string; ends_at: string; lesson_type: LessonType; sports: { name: string } | null } | null } | null;
  }[];
};

export type Statement = ReturnType<typeof buildStatement>;

export function buildStatement(r: SettlementRow) {
  const [y, m] = r.month.split("-").map(Number);
  const tax = withholding(r.gross, r.withholding > 0);
  const payType = payTypeOf(r.pay_type, !!r.payee);
  const items = r.settlement_items
    .map((i) => ({ job: i.assignments?.jobs, amount: i.amount }))
    .sort((a, b) => (a.job?.starts_at ?? "").localeCompare(b.job?.starts_at ?? ""))
    .map(({ job, amount }) => ({
      when: job ? formatLessonTime(job.starts_at, job.ends_at) : "",
      lesson: job ? `${job.sports?.name ?? ""} ${LESSON_TYPES[job.lesson_type].label}`.trim() : "",
      amount,
    }));
  return {
    id: r.id,
    month: `${y}-${String(m).padStart(2, "0")}`,
    title: `${y}년 ${m}월 강습료 정산서`,
    shop: { name: r.shops?.name ?? "", businessNo: r.shops?.business_no ?? null },
    payee: r.payee ? { name: r.payee.name, kind: "강습팀" } : { name: r.instructors?.profiles?.name ?? "", kind: "개인 강사" },
    items,
    gross: r.gross,
    payType,
    tax: { incomeTax: tax.incomeTax, localTax: tax.localTax, total: r.withholding },
    net: r.net,
    notes: [
      payType.byShop
        ? "원천징수는 샵에서 별도 처리합니다. 이 정산서의 원천세는 0원입니다."
        : r.withholding > 0
          ? "원천세는 사업소득 3.3%(소득세 3% + 지방소득세 0.3%)이며 각 10원 미만은 절사했습니다."
          : "원천징수 대상이 아닌 지급입니다(사업자 지급 또는 소액부징수).",
      "송금은 지급하는 곳에서 직접 합니다. 이 정산서는 겨울파트너에서 발행했습니다.",
    ],
    status: SETTLEMENT_STATUS[r.status] ?? r.status,
  };
}
