// AI 상담 안내 정보(지식 베이스) 종류·검증. 화면(서버 액션)과 엔진이 함께 쓴다.
export const KB_KINDS = ["price", "hours", "location", "policy", "faq", "free_text"] as const;
export type KbKind = (typeof KB_KINDS)[number];

export const KB_KIND_LABEL: Record<KbKind, string> = {
  price: "가격",
  hours: "영업시간",
  location: "위치",
  policy: "정책(변경·취소·환불)",
  faq: "자주 묻는 질문",
  free_text: "기타 안내",
};

export const KB_TITLE_MAX = 80;
export const KB_CONTENT_MAX = 2000;
// 켜 둔 안내 정보 전체 글자 수 상한 (프롬프트에 통째로 넣는다 — 임베딩 없음, 설계 문서)
export const KB_ACTIVE_TOTAL_MAX = 8000;

export type KbItem = { id: string; kind: KbKind; title: string; content: string; is_active: boolean };
export type KbInput = { kind: KbKind; title: string; content: string; isActive: boolean };

export function parseKnowledge(fd: FormData): { ok: true; data: KbInput } | { ok: false; message: string } {
  const kind = String(fd.get("kind") ?? "") as KbKind;
  const title = String(fd.get("title") ?? "").trim();
  const content = String(fd.get("content") ?? "").trim();
  const isActive = fd.get("is_active") === "on";
  if (!KB_KINDS.includes(kind)) return { ok: false, message: "종류를 골라 주세요." };
  if (!title) return { ok: false, message: "제목을 적어 주세요." };
  if (title.length > KB_TITLE_MAX) return { ok: false, message: `제목은 ${KB_TITLE_MAX}자까지입니다.` };
  if (content.length > KB_CONTENT_MAX) return { ok: false, message: `내용은 ${KB_CONTENT_MAX}자까지입니다.` };
  if (isActive && !content) return { ok: false, message: "내용을 채운 뒤 사용으로 바꿔 주세요." };
  return { ok: true, data: { kind, title, content, isActive } };
}

// 켜 둔 항목 글자 수 합 (바꾸려는 항목은 새 값으로 계산)
export function activeTotal(items: Pick<KbItem, "id" | "content" | "is_active">[], change?: { id: string | null; content: string; isActive: boolean }) {
  const rest = items.filter((i) => i.id !== change?.id && i.is_active).reduce((n, i) => n + i.content.length, 0);
  return rest + (change?.isActive ? change.content.length : 0);
}
