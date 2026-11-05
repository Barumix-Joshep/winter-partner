// P22-3 카카오 어댑터: 스킬 요청 해석·봇 id 대조·응답 JSON 형식·콜백 1회 (가짜 서버만, 실제 카카오 안 부름)
import { describe, expect, it, vi } from "vitest";
import { KakaoAdapter, botMatches, callbackUrlAllowed, parseSkillRequest, postKakaoCallback } from "./adapter";
import { KakaoCsTalkAdapter } from "./cstalk";
import {
  DEFAULT_GUIDANCE,
  ESCALATE_TEXT,
  KAKAO_TEXT_MAX,
  WAITING_TEXT,
  callbackAck,
  escalateResponse,
  guidanceResponse,
  simpleTextResponse,
} from "./format";
import { skillPayload } from "./fixtures";

describe("스킬 요청 해석", () => {
  it("발화·사용자 id·봇 id·콜백 주소를 꺼낸다", () => {
    const m = parseSkillRequest(skillPayload());
    expect(m).toEqual({
      channel: "kakao",
      externalUserId: "kakao-user-0001",
      text: "강습료 얼마예요?",
      messageId: null,
      accountId: "bot-0001",
      displayName: null,
      replyUrl: "https://bot-api.kakao.com/v1/callback/abc",
    });
  });
  it("콜백을 켜지 않은 블록이면 replyUrl은 null", () => {
    expect(parseSkillRequest(skillPayload({ callbackUrl: null }))?.replyUrl).toBeNull();
  });
  it("형식이 틀리면 null", () => {
    expect(parseSkillRequest(null)).toBeNull();
    expect(parseSkillRequest("문자열")).toBeNull();
    expect(parseSkillRequest({})).toBeNull();
    expect(parseSkillRequest({ userRequest: { utterance: "안녕", user: {} } })).toBeNull();
    expect(parseSkillRequest({ userRequest: { utterance: 3, user: { id: "u" } } })).toBeNull();
    expect(parseSkillRequest({ userRequest: { utterance: "안녕", user: { id: "x".repeat(300) } } })).toBeNull();
  });
  it("발화 id가 오면 쓴다", () => {
    const p = skillPayload();
    expect(parseSkillRequest({ ...p, userRequest: { ...p.userRequest, id: "utt-1" } })?.messageId).toBe("utt-1");
  });
  it("KakaoAdapter.receive도 같은 결과", () => {
    expect(new KakaoAdapter().receive(skillPayload())?.text).toBe("강습료 얼마예요?");
  });
});

describe("봇 id 대조", () => {
  it("같으면 통과, 다르거나 비어 있으면 거부", () => {
    expect(botMatches("bot-0001", "bot-0001")).toBe(true);
    expect(botMatches("bot-0001", "bot-9999")).toBe(false);
    expect(botMatches(null, "bot-0001")).toBe(false);
    expect(botMatches("bot-0001", null)).toBe(false);
    expect(botMatches("", "")).toBe(false);
  });
  it("배포·테스트 봇 id 끝의 느낌표는 무시한다", () => {
    expect(botMatches("bot-0001", "bot-0001!")).toBe(true);
  });
});

describe("응답 JSON 형식", () => {
  it("simpleText (version 2.0)", () => {
    expect(simpleTextResponse("안녕하세요")).toEqual({ version: "2.0", template: { outputs: [{ simpleText: { text: "안녕하세요" } }] } });
  });
  it("simpleText는 1000자를 넘지 않는다", () => {
    const r = simpleTextResponse("가".repeat(1500));
    const t = (r.template!.outputs[0] as { simpleText: { text: string } }).simpleText.text;
    expect([...t].length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
  });
  it("escalate는 상담 연결(operator) 버튼", () => {
    expect(escalateResponse()).toEqual({
      version: "2.0",
      template: { outputs: [{ textCard: { description: ESCALATE_TEXT, buttons: [{ label: "상담 연결", action: "operator" }] } }] },
    });
    expect(ESCALATE_TEXT).toBe("사장님께 전달했어요. 곧 채널 1:1 채팅으로 답드릴게요.");
  });
  it("콜백 대기 응답: useCallback + data.text, template 없음", () => {
    expect(callbackAck()).toEqual({ version: "2.0", useCallback: true, data: { text: WAITING_TEXT } });
    expect(WAITING_TEXT).toBe("답변을 준비하고 있어요…");
  });
  it("기본 안내", () => {
    expect(guidanceResponse()).toEqual(simpleTextResponse(DEFAULT_GUIDANCE));
    expect(DEFAULT_GUIDANCE).toBe("지금은 자동 상담을 받을 수 없어요. 샵으로 직접 문의해 주세요.");
  });
  it("버튼 라벨은 14자 이하", () => {
    const btn = (escalateResponse().template!.outputs[0] as { textCard: { buttons: { label: string }[] } }).textCard.buttons[0];
    expect([...btn.label].length).toBeLessThanOrEqual(14);
  });
});

describe("콜백 주소", () => {
  it("카카오 https 주소만", () => {
    expect(callbackUrlAllowed("https://bot-api.kakao.com/v1/callback/abc")).toBe(true);
    expect(callbackUrlAllowed("https://kakao.com/x")).toBe(true);
    expect(callbackUrlAllowed("http://bot-api.kakao.com/x")).toBe(false);
    expect(callbackUrlAllowed("https://kakao.com.evil.test/x")).toBe(false);
    expect(callbackUrlAllowed("https://evilkakao.com/x")).toBe(false);
    expect(callbackUrlAllowed("http://127.0.0.1:4000/cb")).toBe(false);
    expect(callbackUrlAllowed("주소 아님")).toBe(false);
    expect(callbackUrlAllowed(null)).toBe(false);
  });
  it("시험용 로컬 주소는 KAKAO_CALLBACK_ALLOW_LOCAL=1일 때만", () => {
    expect(callbackUrlAllowed("http://127.0.0.1:4000/cb", { allowLocal: true })).toBe(true);
    expect(callbackUrlAllowed("http://localhost:4000/cb", { allowLocal: true })).toBe(true);
    expect(callbackUrlAllowed("http://10.0.0.1/cb", { allowLocal: true })).toBe(false);
  });
});

describe("콜백 보내기 (한 번만)", () => {
  const body = simpleTextResponse("안내드려요");
  it("한 번 POST하고 성공이면 true", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ taskId: "t", status: "SUCCESS" }), { status: 200 }));
    expect(await postKakaoCallback("https://bot-api.kakao.com/cb", body, fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bot-api.kakao.com/cb");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(body);
  });
  it("500이면 false, 다시 보내지 않는다", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 500 }));
    expect(await postKakaoCallback("https://bot-api.kakao.com/cb", body, fetchImpl)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("카카오가 FAIL을 돌려주면 false", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "FAIL", message: "expired" }), { status: 200 }));
    expect(await postKakaoCallback("https://bot-api.kakao.com/cb", body, fetchImpl)).toBe(false);
  });
  it("네트워크 오류면 false, 다시 보내지 않는다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await postKakaoCallback("https://bot-api.kakao.com/cb", body, fetchImpl)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("KakaoAdapter.send·canSend", () => {
  it("콜백 주소가 있으면 보낼 수 있고, 없으면 무료 챗봇은 먼저 보낼 수 없다", () => {
    const a = new KakaoAdapter();
    expect(a.canSend({ replyUrl: "https://bot-api.kakao.com/cb" }, new Date())).toEqual({ ok: true });
    expect(a.canSend({ replyUrl: null }, new Date())).toMatchObject({ ok: false, reason: "kakao_reply_only" });
  });
  it("send: escalate면 상담 연결 버튼 형식으로 한 번", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const a = new KakaoAdapter({ fetchImpl });
    expect(await a.send({ replyUrl: "https://bot-api.kakao.com/cb" }, ESCALATE_TEXT, { escalate: true })).toEqual({ ok: true, status: "sent" });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual(escalateResponse());
  });
  it("send: 콜백 주소가 없으면 보내지 않는다(skipped)", async () => {
    const fetchImpl = vi.fn();
    expect(await new KakaoAdapter({ fetchImpl }).send({ replyUrl: null }, "x")).toMatchObject({ ok: false, status: "skipped" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("상담톡 껍데기", () => {
  it("세 함수 모두 지원 안 함", async () => {
    const a = new KakaoCsTalkAdapter();
    expect(a.channel).toBe("kakao_cstalk");
    expect(a.receive({})).toBeNull();
    expect(await a.send({}, "x")).toEqual({ ok: false, status: "skipped", reason: "unsupported", message: "지원 안 함" });
    expect(a.canSend({}, new Date())).toEqual({ ok: false, reason: "unsupported", message: "지원 안 함" });
  });
});
