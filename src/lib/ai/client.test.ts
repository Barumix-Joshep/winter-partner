import { describe, expect, it, vi } from "vitest";
import { callStructured, isAiEnabled, type AiDeps } from "./client";
import type { AiTransport } from "./types";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

function deps(transport: AiTransport | null, allowed = true) {
  const record = vi.fn(async () => {});
  const d: AiDeps = {
    gate: async () => ({ allowed, reason: allowed ? "ok" : "shop_off", model: "claude-haiku-5-5" }),
    record,
    transport: () => transport,
  };
  return { d, record };
}

const base = {
  feature: "intake" as const,
  shopId: "s1",
  userId: "u1",
  system: "sys",
  content: "hello",
  toolName: "t",
  schema: { type: "object" },
  parse: (x: unknown) => (x && typeof x === "object" && "ok" in x ? (x as { ok: boolean }) : null),
};

describe("callStructured", () => {
  it("스키마를 통과한 결과를 돌려주고 사용량을 남긴다", async () => {
    const { d, record } = deps(async () => ({ input: { ok: true }, usage: { input_tokens: 10, output_tokens: 5 } }));
    expect(await callStructured(base, d)).toEqual({ ok: true });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ ok: true, input: 10, output: 5, model: "claude-haiku-5-5" }));
  });

  it("키가 없으면 부르지 않고 null", async () => {
    const { d, record } = deps(null);
    expect(await callStructured(base, d)).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });

  it("꺼져 있거나 상한이면 null", async () => {
    const t = vi.fn(async () => ({ input: { ok: true }, usage: { input_tokens: 1, output_tokens: 1 } }));
    const { d } = deps(t, false);
    expect(await callStructured(base, d)).toBeNull();
    expect(t).not.toHaveBeenCalled();
  });

  it("형식이 틀리면 한 번 더 부르고, 그래도 틀리면 null", async () => {
    const t = vi.fn(async () => ({ input: { wrong: 1 }, usage: { input_tokens: 1, output_tokens: 1 } }));
    const { d, record } = deps(t);
    expect(await callStructured(base, d)).toBeNull();
    expect(t).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("오류가 나면 재시도해서 성공하면 결과", async () => {
    let n = 0;
    const t: AiTransport = async () => {
      if (n++ === 0) throw new Error("boom");
      return { input: { ok: true }, usage: { input_tokens: 1, output_tokens: 1 } };
    };
    const { d } = deps(t);
    expect(await callStructured(base, d)).toEqual({ ok: true });
  });

  it("15초 타임아웃이면 중단하고 null", async () => {
    vi.useFakeTimers();
    const t: AiTransport = (_req, signal) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const { d } = deps(t);
    const p = callStructured(base, d);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await p).toBeNull();
    vi.useRealTimers();
  });

  it("도구 이름·스키마·모델을 그대로 넘긴다", async () => {
    const t = vi.fn<AiTransport>(async () => ({ input: { ok: true }, usage: { input_tokens: 1, output_tokens: 1 } }));
    const { d } = deps(t);
    await callStructured({ ...base, toolName: "extract", schema: { type: "object", properties: {} } }, d);
    expect(t.mock.calls[0][0]).toMatchObject({ toolName: "extract", model: "claude-haiku-5-5", schema: { type: "object", properties: {} } });
  });
});

describe("isAiEnabled", () => {
  it("키와 허용 둘 다 있어야", async () => {
    expect(await isAiEnabled("s1", "intake", deps(async () => ({ input: null, usage: { input_tokens: 0, output_tokens: 0 } })).d)).toBe(true);
    expect(await isAiEnabled("s1", "intake", deps(null).d)).toBe(false);
    expect(await isAiEnabled("s1", "intake", deps(async () => ({ input: null, usage: { input_tokens: 0, output_tokens: 0 } }), false).d)).toBe(false);
  });
});
