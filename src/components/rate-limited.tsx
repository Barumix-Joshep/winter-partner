import { limitMessage, type LimitName } from "@/lib/ops/limits";

// 요청 횟수 제한에 걸렸을 때 보여 주는 안내 (P16-3)
export function RateLimited({ name }: { name: LimitName }) {
  return (
    <div role="alert" className="rounded-[14px] border border-line bg-white p-5 text-sm leading-6">
      <p className="font-bold">잠시 쉬었다가 다시 열어 주세요</p>
      <p className="mt-1 text-ink-muted">{limitMessage(name)}</p>
      <p className="mt-1 text-ink-muted">계속 열리지 않으면 링크를 보낸 샵에 문의해 주세요.</p>
    </div>
  );
}
