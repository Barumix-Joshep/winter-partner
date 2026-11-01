import { describe, expect, it } from "vitest";
import { CERT_MAX_BYTES, certPath, parseCert } from "./cert";

function form(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

describe("parseCert", () => {
  it("발급처·등급·파일을 받는다", () => {
    const f = file("ksia.pdf", "application/pdf");
    const r = parseCert(form({ issuer: " KSIA ", grade: "Level 2", file: f }));
    expect(r.ok && { issuer: r.data.issuer, grade: r.data.grade, ext: r.data.ext }).toEqual({ issuer: "KSIA", grade: "Level 2", ext: "pdf" });
  });

  it("발급처와 파일은 필수", () => {
    const r = parseCert(form({ issuer: "", grade: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.issuer).toBeDefined();
      expect(r.errors.file).toBeDefined();
    }
  });

  it("이미지·PDF만, 4MB까지", () => {
    expect(parseCert(form({ issuer: "KSIA", file: file("a.exe", "application/x-msdownload") })).ok).toBe(false);
    expect(parseCert(form({ issuer: "KSIA", file: file("a.jpg", "image/jpeg", CERT_MAX_BYTES + 1) })).ok).toBe(false);
    expect(parseCert(form({ issuer: "KSIA", file: file("a.jpg", "image/jpeg", CERT_MAX_BYTES) })).ok).toBe(true);
  });
});

describe("certPath", () => {
  it("강사 폴더 아래 무작위 이름 (원래 파일명은 쓰지 않는다)", () => {
    const p = certPath("inst-1", "png");
    expect(p).toMatch(/^inst-1\/[0-9a-f-]{36}\.png$/);
  });
});
