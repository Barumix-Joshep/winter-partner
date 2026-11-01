import { COLLECTION_NOTICE } from "@/lib/privacy/texts";

// 손님 정보 입력 화면의 수집 안내 (계약 이행 근거라 동의 체크 없이 안내만)
export function CollectionNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-[#35466A] ${className}`}>
      <strong className="font-medium">{COLLECTION_NOTICE.title}</strong> · {COLLECTION_NOTICE.body} 손님에게 이 내용을 안내해 주세요.
    </p>
  );
}
