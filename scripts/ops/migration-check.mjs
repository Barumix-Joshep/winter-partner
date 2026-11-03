#!/usr/bin/env node
// 풀 리퀘스트 마이그레이션 점검 (P20-2). CI에서: node scripts/ops/migration-check.mjs <기준 커밋>
// 이 풀 리퀘스트가 추가·수정한 마이그레이션마다 (1) 되돌리기 메모가 있는지 (2) docs/pending-migrations.md 대기 목록에 있는지 본다.
// 결과 첫 줄은 "changed=<개수>" (워크플로가 라벨을 붙일지 정한다).
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { analyze, MIGRATIONS_DIR, PENDING_DOC } from "./migrations.mjs";

const base = process.argv[2] ?? "origin/main";
const changed = execSync(`git diff --name-only --diff-filter=AM ${base}...HEAD -- ${MIGRATIONS_DIR}`, { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".sql"));
console.log(`changed=${changed.length}`);
if (!changed.length) process.exit(0);

const pending = existsSync(PENDING_DOC) ? readFileSync(PENDING_DOC, "utf8") : "";
const problems = [];
for (const f of changed) {
  const a = analyze(f);
  if (!a.hasRollbackNote) problems.push(`${a.file}: 머리 주석에 "되돌리기:" 메모가 없습니다`);
  if (!pending.includes(a.file)) problems.push(`${a.file}: ${PENDING_DOC} 대기 목록에 없습니다`);
  console.log(`- ${a.file}: 표 추가 ${a.tablesCreated.length}, 표 변경 ${a.tablesAltered.length}, 함수 ${a.functions.length}, 데이터 변경 ${a.dataChanges.length}`);
}
if (problems.length) {
  console.error(problems.map((p) => `::error::${p}`).join("\n"));
  process.exit(1);
}
