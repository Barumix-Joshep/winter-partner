// 테스트용 카카오 스킬 요청 (단위·E2E 공용). 실제 카카오 형식을 따른 가짜 값이다.
export function skillPayload(over: { utterance?: string; userId?: string; botId?: string; callbackUrl?: string | null } = {}) {
  return {
    intent: { id: "intent-1", name: "폴백 블록" },
    userRequest: {
      timezone: "Asia/Seoul",
      block: { id: "block-1", name: "폴백 블록" },
      utterance: over.utterance ?? "강습료 얼마예요?",
      lang: "ko",
      user: { id: over.userId ?? "kakao-user-0001", type: "botUserKey", properties: {} },
      ...(over.callbackUrl === null ? {} : { callbackUrl: over.callbackUrl ?? "https://bot-api.kakao.com/v1/callback/abc" }),
    },
    bot: { id: over.botId ?? "bot-0001", name: "[테스트] 하이원 렌탈" },
    action: { id: "skill-1", name: "winter-partner", params: {}, detailParams: {}, clientExtra: {} },
  };
}
