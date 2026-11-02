import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { COLLECTION_NOTICE, DRAFT_LABEL, OPTIONAL_CONSENTS } from "@/lib/privacy/texts";

// 샵이 매장·홈페이지에 게시할 개인정보 처리위탁 고지와 손님 안내 문구 템플릿 (초안 — 법률 검토 전)
export default function PrivacyNoticePage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">개인정보 고지 문구</h1>
        <p className="mt-1 text-sm text-ink-muted">
          손님 정보의 주인은 우리 샵이고, 겨울파트너는 위탁을 받아 처리합니다. 아래 문구를 매장(카운터)과 홈페이지에 게시해 주세요. 그대로 인쇄하거나 복사해 쓰시면 됩니다.
        </p>
        <p className="mt-2 rounded-[10px] border border-[#F3D4A8] bg-[#FFF1E0] p-3 text-sm text-[#7A3E06]">
          <strong>{DRAFT_LABEL}</strong> · 정식 사용 전에 법률 검토를 거쳐 바뀔 수 있습니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Notice />
      </Suspense>
    </div>
  );
}

async function Notice() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  return (
    <article className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-6 text-sm leading-7 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
      <section>
        <h2>{shop.name} 개인정보 처리 안내</h2>
        <p>{COLLECTION_NOTICE.body}</p>
      </section>
      <section>
        <h2>개인정보 처리업무 위탁</h2>
        <ul>
          <li>수탁자: 겨울파트너(사업자 정보 [확정 후 기재])</li>
          <li>위탁 업무: 손님 정보 관리, 강습 예약·배정·연락, 강사 수업 메모 공유(우리 샵 안), 셀프 등록·선택 동의 기록, 보관 기간 경과 시 익명화</li>
          <li>보관 기간: 마지막 강습 후 3시즌(11월~다음 해 4월)이 지나면 익명화합니다.</li>
          <li>재위탁: Anthropic PBC(미국) — 예약 글 정리·요약 등 AI 도우미 (연락처는 보내지 않음, 샵이 끌 수 있음) [AI 도우미를 쓰는 샵만 게시]</li>
        </ul>
      </section>
      <section>
        <h2>선택 동의 (원하는 분만)</h2>
        <ul>
          {Object.values(OPTIONAL_CONSENTS).map((c) => (
            <li key={c.version}>
              {c.label} — {c.detail}
            </li>
          ))}
        </ul>
        <p>14세 미만 손님은 보호자의 동의가 필요합니다.</p>
      </section>
      <section>
        <h2>문의·열람·삭제 요청</h2>
        <p>
          {shop.name} 카운터 또는 [샵 연락처 기재]로 요청해 주세요. 삭제를 요청하시면 지체 없이 처리합니다. 겨울파트너 개인정보 처리방침: /privacy
        </p>
      </section>
    </article>
  );
}
