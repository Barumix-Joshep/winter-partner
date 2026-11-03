// 마이그레이션 파일 분석 (P20-2·P20-4). CI 점검(migration-check.mjs)과 적용 전 점검(migration-preflight.mjs)이 같이 쓴다.
// 읽기만 한다. DB에 붙지 않는다.
import { readFileSync } from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = "supabase/migrations";
export const PENDING_DOC = "docs/pending-migrations.md";

const uniq = (a) => [...new Set(a)].sort();
const names = (sql, re) => uniq([...sql.matchAll(re)].map((m) => m[1].replace(/^public\./, "")));

// 주석을 지운 SQL (함수 본문의 -- 주석도). 문자열 안의 --는 드물어 무시한다.
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

export function analyze(file) {
  const raw = readFileSync(file, "utf8");
  const sql = stripComments(raw);
  // 함수 본문($$ … $$) 밖의 문장만 "지금 실행되는" 데이터 변경으로 본다
  // 트리거·정책·권한 문장의 "update"·"delete"·"insert"는 데이터 변경이 아니므로 뺀다
  const outside = sql
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "")
    .replace(/\b(create\s+(?:or\s+replace\s+)?(?:trigger|policy)|grant|revoke)\b[^;]*;/gi, (m) => (/^create\s+(?:or\s+replace\s+)?(trigger|policy)/i.test(m) ? m.replace(/\b(update|delete|insert)\b/gi, "") : ""));
  const dataChanges = [
    ...[...outside.matchAll(/\b(update|delete\s+from|insert\s+into|truncate)\s+([a-z_.]+)/gi)].map((m) => `${m[1].toLowerCase().replace(/\s+/g, " ")} ${m[2]}`),
    ...[...outside.matchAll(/\bdrop\s+(table|column)\s+(if\s+exists\s+)?([a-z_.]+)/gi)].map((m) => `drop ${m[1].toLowerCase()} ${m[3]}`),
  ];
  return {
    file: path.basename(file),
    tablesCreated: names(outside, /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_.]+)/gi),
    tablesAltered: names(outside, /alter\s+table\s+(?:only\s+)?([a-z_.]+)/gi),
    functions: names(outside, /create\s+(?:or\s+replace\s+)?function\s+([a-z_.]+)/gi),
    triggers: names(outside, /create\s+trigger\s+([a-z_]+)/gi),
    policies: names(outside, /(?:create|drop)\s+policy\s+(?:if\s+exists\s+)?([a-z_]+)/gi),
    dataChanges: uniq(dataChanges),
    // 기존 행이 어기면 적용이 실패하는 것: CHECK·고유·외래 키 제약, 고유 색인, not null 추가
    constraints: uniq([
      ...names(outside, /add\s+constraint\s+([a-z_]+)/gi),
      ...names(outside, /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi),
      ...[...outside.matchAll(/alter\s+column\s+([a-z_]+)\s+set\s+not\s+null/gi)].map((m) => `${m[1]} not null`),
    ]),
    // 규칙: 머리 주석에 "되돌리기:"를 적는다 (docs/rollback.md)
    hasRollbackNote: /^--.*되돌리기/m.test(raw),
  };
}

// 데이터가 바뀌는(행을 고치거나 지우는) 마이그레이션은 적용 전 백업 필수
export const needsBackup = (a) => a.dataChanges.some((d) => !d.startsWith("insert"));
