import "server-only";
// 화면·서버 액션에서 AI 사용 가능 여부를 묻는 입구 (client.ts의 isAiEnabled를 그대로 쓴다)
export { aiKeyConfigured, isAiEnabled } from "./client";
