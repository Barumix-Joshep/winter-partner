// 사장님 인박스(P22-5) 화면 도움 함수 (서버·화면 공용, DB 없음). docs/ai-consult/README.md "화면"
import type { ConsultChannel } from "./types";

export const CHANNEL_LABEL: Record<string, string> = { kakao: "카카오톡", instagram: "인스타그램", kakao_cstalk: "카카오 상담톡" };
export const STATUS_LABEL: Record<string, string> = { bot: "AI 응대", waiting_owner: "사장님 대기", owner: "사장님 답장", closed: "닫음" };
export const ROLE_LABEL: Record<string, string> = { customer: "손님", ai: "AI", owner: "사장님", system: "안내" };
export const DELIVERY_LABEL: Record<string, string> = { pending: "보내는 중", sent: "보냄", failed: "못 보냄", skipped: "직접 보냄·안 보냄" };
export const INTENT_LABEL: Record<string, string> = {
  price: "가격",
  hours: "영업시간",
  location: "위치",
  policy: "정책",
  faq: "자주 묻는 질문",
  booking: "예약",
  negotiation: "금액 협상",
  complaint: "불만",
  smalltalk: "인사",
  unknown: "모름",
};
export const KAKAO_REPLY_NOTE = "무료 챗봇은 먼저 말을 걸 수 없어요 — 채널 1:1 채팅에서 답해 주세요";

// 인박스 화면이 10초마다 다시 그릴지 판단하는 값 (대기 수 + 마지막 메시지 시각)
export const INBOX_POLL_MS = 10_000;
export function inboxVersion(waiting: number, latestMessageAt: string | null | undefined): string {
  return `${waiting}:${latestMessageAt ?? ""}`;
}

type ConvSortable = { status: string; last_customer_message_at: string | null };
export function sortConversations<T extends ConvSortable>(list: T[]): T[] {
  const t = (c: T) => (c.last_customer_message_at ? Date.parse(c.last_customer_message_at) : 0);
  return [...list].sort((a, b) => Number(b.status === "waiting_owner") - Number(a.status === "waiting_owner") || t(b) - t(a));
}

// 손님 표시: 채널 이름이 없으면 해시 앞 4자로만 구분한다(손님 id 원문은 저장하지 않는다)
export function customerLabel(c: { display_name: string | null; external_user_hash: string }): string {
  return c.display_name?.trim() || `손님 #${c.external_user_hash.slice(0, 4)}`;
}

const KST = 9 * 3_600_000;
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + KST).toISOString().slice(0, 10);
}
export const kstTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
// 한국 날짜 하루 → [from, to) UTC 시각
export function kstDayRange(day: string | null | undefined): { from: string; to: string } | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = Date.parse(`${day}T00:00:00+09:00`);
  if (!Number.isFinite(start) || new Date(start + KST).toISOString().slice(0, 10) !== day) return null;
  return { from: new Date(start).toISOString(), to: new Date(start + 24 * 3_600_000).toISOString() };
}

export const OWNER_TEXT_MAX = 2000;
const IG_MAX_BYTES = 1000;
// 사장님 답장 글 검사 (인스타는 UTF-8 1000바이트 — 자르지 않고 알려 준다)
export function ownerTextError(text: string, channel: ConsultChannel | string): string | null {
  const t = text.trim();
  if (!t) return "답장을 적어 주세요.";
  if (channel === "instagram" && new TextEncoder().encode(t).length > IG_MAX_BYTES) return "인스타그램은 한 번에 한글 약 330자까지 보낼 수 있어요. 줄이거나 나눠 보내 주세요.";
  if (t.length > OWNER_TEXT_MAX) return `답장은 ${OWNER_TEXT_MAX.toLocaleString()}자까지 적을 수 있어요.`;
  return null;
}

// [AI 답변 틀림]: 사장님이 초안을 고쳤으면 edited(고친 글 포함), 아니면 wrong
export function feedbackRow(draft: string, edited: string | null | undefined): { kind: "wrong" | "edited"; corrected_text: string | null } {
  const e = (edited ?? "").trim();
  if (!e || e === draft.trim()) return { kind: "wrong", corrected_text: null };
  return { kind: "edited", corrected_text: e.slice(0, 2000) };
}

// [KB에 추가]: 손님 질문 첫 줄 → 제목, 사장님 답 → 내용. 꺼진 상태로 미리 채우고 사장님이 확인해 저장한다.
export function kbPrefill(question: string, answer: string): { kind: "faq"; title: string; content: string } {
  const first = question.trim().split("\n")[0]?.trim() ?? "";
  return { kind: "faq", title: first.slice(0, 80) || "손님 문의", content: answer.trim().slice(0, 2000) };
}
