export type AiFeature = "intake" | "cert" | "bid_assist" | "customer_summary" | "note_tidy" | "health_check" | "revisit" | "admin_query" | "consult";

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  intake: "강습 접수 자동 입력",
  cert: "자격증 판독",
  bid_assist: "입찰 선정 보조",
  customer_summary: "손님 카드 요약",
  note_tidy: "수업 메모 정리",
  health_check: "건강정보 2차 감지",
  revisit: "재방문 안내 문구",
  admin_query: "관리자 질의",
  consult: "AI 상담 (카카오·인스타)",
};

// Anthropic 메시지 내용 블록 (텍스트·이미지)
export type AiContent =
  | string
  | ({ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } })[];

export type AiRequest = {
  model: string;
  system: string;
  content: AiContent;
  toolName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type AiResponse = { input: unknown; usage: { input_tokens: number; output_tokens: number } };

// 모델을 부르는 방법 (실제 SDK 또는 테스트·E2E용 목)
export type AiTransport = (req: AiRequest, signal: AbortSignal) => Promise<AiResponse>;
