import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";

describe("사용 안내", () => {
  it("샵 사장님용·강사용 각각 자주 하는 일 5가지", () => {
    expect(GUIDES.map((g) => [g.key, g.tasks.length])).toEqual([["shop", 5], ["instructor", 5]]);
  });
  it("그림 파일이 있다", () => {
    for (const t of GUIDES.flatMap((g) => g.tasks)) expect(existsSync(`public${t.image}`), t.image).toBe(true);
  });
  it("docs/help-*.md가 화면과 같은 내용이다 (node scripts/help-docs.mjs로 다시 만든다)", () => {
    for (const g of GUIDES) {
      const md = readFileSync(`docs/help-${g.key}.md`, "utf8");
      for (const t of g.tasks) for (const s of [t.title, ...t.steps]) expect(md, s).toContain(s);
    }
  });
  it("쉬운 말: 한 줄이 너무 길지 않다", () => {
    for (const s of GUIDES.flatMap((g) => g.tasks.flatMap((t) => t.steps))) expect(s.length, s).toBeLessThanOrEqual(80);
  });
});
