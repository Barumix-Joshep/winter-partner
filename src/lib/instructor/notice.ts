// 강사 화면의 한 번 띄우는 안내 (?notice=…). 처리한 카드가 목록에서 빠져도 결과를 알려 준다.
// 정해진 값만 문구로 바꾼다 (주소로 임의 문구를 띄울 수 없게).
export type Notice = "reported" | "accepted" | "canceled-1" | "canceled-3";

export function noticeMessage(v: string | null | undefined): string | null {
  switch (v) {
    case "reported":
      return "완료 보고했습니다. 샵이 승인하면 정산에 들어갑니다.";
    case "accepted":
      return "의뢰를 수락했습니다. 일정에서 확인할 수 있습니다.";
    case "canceled-1":
    case "canceled-3":
      return `취소했습니다. 패널티 ${v.slice(-1)}점이 기록됐습니다.`;
    default:
      return null;
  }
}

// 돌아갈 강사 화면 경로에 notice를 붙인다. 강사 화면이 아니면 홈으로.
export function withNotice(back: string, notice: Notice) {
  const u = new URL(back, "http://x");
  const ok = u.origin === "http://x" && !back.startsWith("//") && /^\/instructor(\/|$)/.test(u.pathname);
  const path = ok ? u.pathname : "/instructor";
  const params = ok ? u.searchParams : new URLSearchParams();
  params.set("notice", notice);
  return `${path}?${params.toString()}`;
}
