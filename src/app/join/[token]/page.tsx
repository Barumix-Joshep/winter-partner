import { Suspense } from "react";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { CollectionNotice } from "@/components/collection-notice";
import { DRAFT_LABEL } from "@/lib/privacy/texts";
import { kstYear } from "@/lib/customer/minor";
import { requestTime } from "@/lib/time";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "손님 등록 · 겨울파트너", robots: { index: false, follow: false } };

// 카운터 QR로 여는 손님 셀프 등록 (로그인 없음). 토큰으로는 샵 이름만 알 수 있다.
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Join params={params} />
      </Suspense>
      <p className="text-center text-[11px] text-ink-muted">겨울파트너 · 문구 {DRAFT_LABEL}</p>
    </main>
  );
}

async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await createAdminClient().rpc("public_registration_context", { p_token: token });
  const shop = ((data ?? [])[0] as { shop_name: string } | undefined)?.shop_name;
  if (!shop) {
    return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">만료됐거나 폐기된 링크입니다. 카운터에 말씀해 주세요.</p>;
  }
  return (
    <>
      <div>
        <p className="text-xs text-ink-muted">{shop}</p>
        <h1 className="mt-1 text-xl font-bold">손님 등록</h1>
      </div>
      <CollectionNotice audience="customer" />
      <JoinForm token={token} nowYear={kstYear(await requestTime())} />
    </>
  );
}
