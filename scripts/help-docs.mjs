// docs/help-shop.md·help-instructor.md를 src/lib/help/guides.ts에서 만든다: node scripts/help-docs.mjs
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("../src/lib/help/guides.ts", import.meta.url), "utf8");
const json = src.slice(src.indexOf("export const GUIDES: Guide[] = ") + 31).replace(/;\s*$/, "");
const GUIDES = Function(`return (${json})`)();
for (const g of GUIDES) {
  const md = [
    `# 겨울파트너 사용 안내 — ${g.title}`,
    "",
    `> 앱 안에서는 /help 에서 같은 내용을 볼 수 있습니다. 화면 그림은 [테스트] 데이터입니다.`,
    "",
    g.intro,
    "",
    ...g.tasks.flatMap((t, i) => [`## ${i + 1}. ${t.title}`, "", `![${t.alt}](../public${t.image})`, "", ...t.steps.map((s) => `- ${s}`), ""]),
    `**알림 켜기** — ${g.tip}`,
    "",
  ].join("\n");
  writeFileSync(new URL(`../docs/help-${g.key}.md`, import.meta.url), md);
}
console.log("docs/help-shop.md, docs/help-instructor.md");
