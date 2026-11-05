// AI 상담 엔진 입출력 (채널을 모른다 — 카카오·인스타 어댑터가 이 형식으로 바꿔 부른다, P22-3·4)
export type ConsultChannel = "kakao" | "instagram" | "kakao_cstalk";

// 자동 답변을 허용하는 의도: 안내 정보 범위 사실만 (CLAUDE.md AI 상담 예외)
export const AUTO_INTENTS = ["price", "hours", "location", "policy", "faq"] as const;
export const INTENTS = [...AUTO_INTENTS, "booking", "negotiation", "complaint", "smalltalk", "unknown"] as const;
export type ConsultIntent = (typeof INTENTS)[number];

export type ConsultInput = { shopId: string; conversationId: string; text: string; channel: ConsultChannel };

export type Extracted = { date?: string; time?: string; people?: number; sport?: string; level?: string };

// 왜 사람에게 넘겼는지 (화면·지표용, 손님 글은 들어가지 않는다)
export type EscalateReason =
  | "empty"
  | "too_long"
  | "injection"
  | "ai_unavailable" // 키 없음·꺼짐·상한 초과·실패
  | "auto_off"
  | "intent" // 예약·협상·불만·잡담·모름
  | "low_confidence"
  | "amount_not_in_kb"
  | "no_kb"
  | "contact_in_reply"
  | "rate_limited"; // 대화 요청 제한(consult_conversation)을 넘어 AI를 부르지 않음 (P22-6)

export type ConsultResult = {
  mode: "auto" | "escalate";
  reply: string; // auto면 손님에게 보낼 글(채널 길이에 맞춤), escalate면 손님 안내 글
  confidence: number;
  intent: ConsultIntent;
  draft?: string; // escalate일 때 사장님께 보여 줄 답장 초안
  extracted?: Extracted;
  reason?: EscalateReason;
  promptVersion: string;
};

export type KbEntry = { id: string; kind: string; title: string; content: string };
export type ConsultSettings = { autoReply: boolean; threshold: number; shopName: string };
