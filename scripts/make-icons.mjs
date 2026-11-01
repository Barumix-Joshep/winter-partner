// 앱 아이콘 생성 (프로토타입 로고: 파란 사각형 위 흰 스키 자국 두 줄).
// 실행: node scripts/make-icons.mjs "$PWD" → public/icon-*.png, apple-touch-icon.png
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = process.argv[2];
const require = createRequire(path.join(root, "package.json"));
const React = require("react");
const { ImageResponse } = require("next/og");
const h = React.createElement;

function icon(size, { maskable = false, rounded = true } = {}) {
  const pad = maskable ? size * 0.1 : 0; // maskable은 가장자리가 잘려도 되게 여백
  const inner = size - pad * 2;
  const stroke = Math.round(inner * 0.07);
  const svg = h("svg", { width: inner * 0.62, height: inner * 0.62, viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", strokeWidth: 2.2, strokeLinecap: "round" },
    h("path", { d: "M4 18L20 6M8 20l10-14" }));
  return new ImageResponse(
    h("div", { style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "#1E4FD8" : "transparent" } },
      h("div", { style: { width: inner, height: inner, borderRadius: rounded && !maskable ? inner * 0.22 : 0, background: "#1E4FD8", display: "flex", alignItems: "center", justifyContent: "center" } }, svg)),
    { width: size, height: size },
  );
}
for (const [name, size, opt] of [["icon-192.png", 192, {}], ["icon-512.png", 512, {}], ["icon-maskable-512.png", 512, { maskable: true }], ["apple-touch-icon.png", 180, { rounded: false }]]) {
  const buf = Buffer.from(await icon(size, opt).arrayBuffer());
  await writeFile(path.join(root, "public", name), buf);
  console.log(name, buf.length);
}
