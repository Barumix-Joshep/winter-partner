// 카카오 i 오픈빌더 스킬 응답 형식 (version 2.0). 설계 문서 "플랫폼 제약": simpleText 최대 1000자, 버튼 라벨 14자,
// 상담 연결 버튼은 action "operator"(채널에 상담 연결 플러그인이 있어야 동작), 콜백은 즉시 {useCallback:true, data} 뒤 callbackUrl로 POST.

export const KAKAO_TEXT_MAX = 1000;

export const DEFAULT_GUIDANCE = "지금은 자동 상담을 받을 수 없어요. 샵으로 직접 문의해 주세요.";
export const ESCALATE_TEXT = "사장님께 전달했어요. 곧 채널 1:1 채팅으로 답드릴게요.";
export const WAITING_TEXT = "답변을 준비하고 있어요…";
export const DUPLICATE_TEXT = "메시지를 받았어요. 잠시만 기다려 주세요.";
export const BUSY_TEXT = "메시지가 많아 자동 답변을 잠시 쉬어요. 사장님과 바로 이야기하려면 상담 연결을 눌러 주세요.";
export const OPERATOR_LABEL = "상담 연결";

type Button = { label: string; action: "operator" };
type Output = { simpleText: { text: string } } | { textCard: { description: string; buttons: Button[] } };
export type KakaoSkillResponse = {
  version: "2.0";
  template?: { outputs: Output[] };
  useCallback?: true;
  data?: { text: string };
};

const clip = (t: string, max: number) => {
  const c = [...t];
  return c.length <= max ? t : c.slice(0, max - 1).join("") + "…";
};

export function simpleTextResponse(text: string): KakaoSkillResponse {
  return { version: "2.0", template: { outputs: [{ simpleText: { text: clip(text, KAKAO_TEXT_MAX) } }] } };
}

// 사람에게 넘길 때: 안내 + 상담 연결 버튼 (textCard 설명은 짧게 유지한다)
export function operatorResponse(text: string): KakaoSkillResponse {
  return { version: "2.0", template: { outputs: [{ textCard: { description: clip(text, 400), buttons: [{ label: OPERATOR_LABEL, action: "operator" }] } }] } };
}

export const escalateResponse = () => operatorResponse(ESCALATE_TEXT);
export const busyResponse = () => operatorResponse(BUSY_TEXT);
export const guidanceResponse = () => simpleTextResponse(DEFAULT_GUIDANCE);
export const duplicateResponse = () => simpleTextResponse(DUPLICATE_TEXT);

export function callbackAck(text = WAITING_TEXT): KakaoSkillResponse {
  return { version: "2.0", useCallback: true, data: { text } };
}
