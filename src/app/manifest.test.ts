import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("홈 화면 앱으로 열린다", () => {
    const m = manifest();
    expect(m).toMatchObject({ name: "겨울파트너", short_name: "겨울파트너", start_url: "/", display: "standalone", lang: "ko", theme_color: "#0F1E3D" });
    expect(m.icons?.map((i) => `${i.sizes} ${i.purpose ?? "any"}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });
});
