import { Suspense } from "react";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { CollectionNotice } from "@/components/collection-notice";
import { DRAFT_LABEL } from "@/lib/privacy/texts";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "선택 동의 · 겨울파트너", robots: { index: false, follow: false } };

// 로그인 없이 여는 1회용 동의 페이지. 토큰이 가리키는 손님의 샵 이름·이름 첫 글자·14세 미만 여부만 보여 준다.
export default function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Consent params={params} />
      </Suspense>
      <p className="text-center text-[11px] text-ink-muted">겨울파트너 · 문구 {DRAFT_LABEL}</p>
    </main>
  );
}

async function Consent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await createAdminClient().rpc("public_consent_context", { p_token: token });
  const ctx = (data ?? [])[0] as { shop_name: string; customer_initial: string; is_minor: boolean } | undefined;
  if (!ctx) {
    return (
      <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">
        만료됐거나 이미 쓴 링크입니다. 샵에 새 링크를 요청해 주세요.
      </p>
    );
  }
  return (
    <>
      <div>
        <p className="text-xs text-ink-muted">{ctx.shop_name}</p>
        <h1 className="mt-1 text-xl font-bold">{ctx.customer_initial}○○ 손님 선택 동의</h1>
      </div>
      <CollectionNotice audience="customer" />
      <ConsentForm token={token} minor={ctx.is_minor} />
    </>
  );
}
