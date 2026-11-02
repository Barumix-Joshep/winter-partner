import { describe, expect, it, vi } from "vitest";
import { makeSdkTransport } from "./client";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const req = { model: "claude-sonnet-5-5", system: "sys", content: "hi", toolName: "t", schema: { type: "object" }, maxTokens: 10 };
const ok = { content: [{ type: "tool_use", name: "t", input: { ok: true } }], usage: { input_tokens: 5, output_tokens: 3 } };

describe("makeSdkTransport", () => {
  it("강제 도구 지정이 거절되면 auto로 다시 부르고 그 모델은 기억한다", async () => {
    const create = vi.fn(async (body: { tool_choice: { type: string } }) => {
      if (body.tool_choice.type === "tool") throw Object.assign(new Error('400 tool_choice: type "tool" and "any" are not supported for this model.'), { status: 400 });
      return ok;
    });
    const t = makeSdkTransport(() => ({ messages: { create } }) as never);
    expect(await t(req, new AbortController().signal)).toEqual({ input: { ok: true }, usage: { input_tokens: 5, output_tokens: 3 } });
    expect(create.mock.calls.map((c) => c[0].tool_choice.type)).toEqual(["tool", "auto"]);
    await t(req, new AbortController().signal);
    expect(create.mock.calls.map((c) => c[0].tool_choice.type)).toEqual(["tool", "auto", "auto"]); // 두 번째부터는 바로 auto
  });

  it("다른 400은 그대로 던진다", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("400 bad"), { status: 400 });
    });
    const t = makeSdkTransport(() => ({ messages: { create } }) as never);
    await expect(t({ ...req, model: "m2" }, new AbortController().signal)).rejects.toThrow("400 bad");
  });

  it("도구 호출 없이 글만 오면 input은 null (호출부가 실패로 본다)", async () => {
    const create = vi.fn(async () => ({ content: [{ type: "text", text: "추천합니다" }], usage: { input_tokens: 1, output_tokens: 1 } }));
    const t = makeSdkTransport(() => ({ messages: { create } }) as never);
    expect((await t({ ...req, model: "m3" }, new AbortController().signal)).input).toBeNull();
  });
});
