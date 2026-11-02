// AI_MOCK=1일 때 쓰는 가짜 모델 (E2E·로컬 개발). 실제 API를 부르지 않고, 기능별로 정해진 형식의 답을 만든다.
import type { AiResponse, AiTransport } from "./types";

const usage = { input_tokens: 100, output_tokens: 50 };

export const mockTransport: AiTransport = async (req): Promise<AiResponse> => {
  const text = typeof req.content === "string" ? req.content : req.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const handler = MOCKS[req.toolName];
  return { input: handler ? handler(text) : null, usage };
};

// 기능별 목 응답 (각 기능 작업에서 채운다)
export const MOCKS: Record<string, (text: string) => unknown> = {};
