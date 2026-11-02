// AI_MOCK=1일 때 쓰는 가짜 모델 (E2E·로컬 개발). 실제 API를 부르지 않고, 기능별로 정해진 형식의 답을 만든다.
import type { AiResponse, AiTransport } from "./types";
import { mockExtractIntake } from "./intake-mock";

const usage = { input_tokens: 100, output_tokens: 50 };

export const mockTransport: AiTransport = async (req): Promise<AiResponse> => {
  const text = typeof req.content === "string" ? req.content : req.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const handler = MOCKS[req.toolName];
  return { input: handler ? handler(text, req.system) : null, usage };
};

// 기능별 목 응답 (각 기능 작업에서 채운다)
export const MOCKS: Record<string, (text: string, system: string) => unknown> = {
  extract_lesson_request: (text, system) => mockExtractIntake(system, text),
  // 가짜 입찰 추천: 첫 입찰(가장 싼 것)을 추천
  recommend_bid: (text) => {
    const first = text.match(/- ((?:강사|팀)\d+):/);
    return first
      ? { recommended: first[1], reasons: ["가장 낮은 금액입니다.", "조건과 맞지 않는 점은 보이지 않습니다."], bids: [{ label: first[1], note: "금액이 가장 낮음" }], flags: [] }
      : null;
  },
  // 가짜 판독: 성명은 일부러 다른 이름 → 관리자 화면 "확인 필요" 흐름 확인용
  read_certificate: () => ({ issuer: "KSIA", grade: "Level 2", holder_name: "홍길동", issued_on: "2024-03-01", expires_on: "2030-02-28", number_last4: "1234", readable: true }),
};
