import { COLLECTION_NOTICE } from "@/lib/privacy/texts";

// 손님 정보 수집 안내 (계약 이행 근거라 동의 체크 없이 안내만). staff: 샵 직원 화면, customer: 손님이 보는 화면
export function CollectionNotice({ className = "", audience = "staff" }: { className?: string; audience?: "staff" | "customer" }) {
  return (
    <p className={`rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-[#35466A] ${className}`}>
      <strong className="font-medium">{COLLECTION_NOTICE.title}</strong> · {COLLECTION_NOTICE.body}
      {audience === "staff" ? " 손님에게 이 내용을 안내해 주세요." : ""}
    </p>
  );
}
