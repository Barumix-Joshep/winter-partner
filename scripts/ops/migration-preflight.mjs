#!/usr/bin/env node
// 원격 적용 전 점검 (P20-4). 사장님 승인 요청 때 한 번에 보고할 내용을 만든다. 운영 DB에는 읽기(목록 조회)만 한다.
//   node scripts/ops/migration-preflight.mjs           → 원격 목록과 비교 (npx supabase link 필요)
//   node scripts/ops/migration-preflight.mjs --files a.sql b.sql → 원격 조회 없이 파일만
// 행 수(영향 받는 행)는 이 스크립트가 세지 않는다. 표가 나오면 그 표만 서비스 키로 읽어 센다(docs/ci.md).
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { analyze, needsBackup, MIGRATIONS_DIR } from "./migrations.mjs";

let files;
const i = process.argv.indexOf("--files");
if (i > 0) {
  files = process.argv.slice(i + 1);
} else {
  const out = execSync("npx supabase migration list --linked", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const list = JSON.parse(out.slice(out.indexOf("{"))).migrations;
  const pending = new Set(list.filter((m) => m.local && !m.remote).map((m) => m.local));
  const remoteOnly = list.filter((m) => m.remote && !m.local).map((m) => m.remote);
  if (remoteOnly.length) console.log(`> 주의: 원격에만 있는 마이그레이션 ${remoteOnly.join(", ")} (저장소에 파일 없음)\n`);
  files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && pending.has(f.split("_")[0]))
    .map((f) => path.join(MIGRATIONS_DIR, f));
}

if (!files.length) {
  console.log("원격에 적용할 마이그레이션이 없습니다.");
  process.exit(0);
}
const rows = files.map(analyze);
const cell = (a) => (a.length ? a.join(", ") : "—");
console.log(`## 원격 적용 대기 마이그레이션 ${rows.length}개\n`);
console.log("| 파일 | 새 표 | 바뀌는 표 | 함수·트리거·정책 | 지금 바뀌는 데이터 | 되돌리기 메모 | 사전 백업 |");
console.log("|---|---|---|---|---|---|---|");
for (const a of rows) {
  console.log(
    `| ${a.file} | ${cell(a.tablesCreated)} | ${cell(a.tablesAltered)} | ${cell([...a.functions, ...a.triggers, ...a.policies.map((p) => `정책 ${p}`)])} | ${cell(a.dataChanges)} | ${a.hasRollbackNote ? "있음" : "**없음**"} | ${needsBackup(a) ? "**필수** (scripts/ops/db-backup.sh)" : "권장"} |`,
  );
}
for (const a of rows.filter((r) => r.constraints.length)) {
  console.log(`\n> ${a.file}: 제약·고유 색인 추가(${a.constraints.join(", ")}) — 기존 운영 행이 어기지 않는지 먼저 세어 보고에 넣으세요.`);
}
const missing = rows.filter((a) => !a.hasRollbackNote).map((a) => a.file);
if (missing.length) console.log(`\n> 되돌리기 메모가 없는 파일: ${missing.join(", ")} — 적용 전에 메모를 추가하세요.`);
