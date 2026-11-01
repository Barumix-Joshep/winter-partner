#!/usr/bin/env node
// 푸시 전 기본 보안 점검. 실패하면 종료 코드 1.
// 1) 비밀값 유출  2) .env 파일 커밋  3) RLS 누락 테이블  4) 클라이언트 코드의 service role 사용  5) 의존성 취약점(high 이상)
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const problems = [];
const warn = [];

// 추적 중인 파일 목록 (git 기준)
const files = sh('git ls-files -z').split('\0').filter(Boolean);

// 1. .env 류 파일이 커밋돼 있는가 (예시 파일은 허용)
for (const f of files) {
  const base = f.split('/').pop();
  if (/^\.env(\..*)?$/.test(base) && !base.endsWith('.example')) problems.push(`환경변수 파일이 저장소에 있습니다: ${f}`);
}

// 2. 비밀값 패턴
const PATTERNS = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['JWT (service_role 키일 수 있음)', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['GitHub 토큰', /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/],
  ['AWS 액세스 키', /\bAKIA[0-9A-Z]{16}\b/],
  ['개인 키', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['Postgres 접속 문자열(비밀번호 포함)', /postgres(ql)?:\/\/[^:\s'"]+:[^@\s'"]{6,}@/],
];
const SKIP = /(^|\/)(package-lock\.json|node_modules\/|\.next\/)|\.(png|jpg|jpeg|gif|ico|woff2?|pdf)$/;
for (const f of files) {
  if (SKIP.test(f) || !existsSync(f)) continue;
  let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    if (/security-check:\s*allow/.test(line)) return;
    for (const [name, re] of PATTERNS) if (re.test(line)) problems.push(`${name} 의심: ${f}:${i + 1}`);
  });
}

// 3. RLS: 마이그레이션에서 만든 public 테이블은 모두 RLS를 켜야 한다
const migs = files.filter((f) => /^supabase\/migrations\/.*\.sql$/.test(f)).sort();
const created = new Set(), rls = new Set(), dropped = new Set();
for (const f of migs) {
  const sql = readFileSync(f, 'utf8').replace(/--.*$/gm, '');
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?)(\w+)\1/gi)) created.add(m[2].toLowerCase());
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?("?)(\w+)\1\s+enable\s+row\s+level\s+security/gi)) rls.add(m[2].toLowerCase());
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?("?)(\w+)\1/gi)) dropped.add(m[2].toLowerCase());
}
for (const t of created) if (!rls.has(t) && !dropped.has(t)) problems.push(`RLS가 꺼진 테이블: ${t} (alter table ${t} enable row level security 필요)`);

// 4. service role 키는 서버 전용. 클라이언트 컴포넌트나 NEXT_PUBLIC 변수에 쓰면 안 된다
for (const f of files.filter((f) => /^src\/.*\.(t|j)sx?$/.test(f))) {
  const text = readFileSync(f, 'utf8');
  const isClient = /^\s*['"]use client['"]/m.test(text);
  if (/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE|NEXT_PUBLIC_[A-Z_]*SECRET/.test(text)) problems.push(`비밀 키를 NEXT_PUBLIC 변수로 노출: ${f}`);
  if (isClient && /SUPABASE_SERVICE_ROLE_KEY|service_role/.test(text)) problems.push(`클라이언트 컴포넌트에서 service role 사용: ${f}`);
  if (/dangerouslySetInnerHTML/.test(text)) warn.push(`dangerouslySetInnerHTML 사용 (입력값이 들어가면 XSS 위험): ${f}`);
}

// 5. 의존성 취약점 (운영 의존성, high 이상)
if (!process.argv.includes('--offline')) {
  try {
    sh('npm audit --omit=dev --audit-level=high');
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    if (/ENOTFOUND|EAI_AGAIN|network/i.test(out)) warn.push('npm audit: 네트워크 문제로 건너뜀');
    else problems.push('npm audit: high 이상 취약점이 있습니다. `npm audit --omit=dev`로 확인하세요');
  }
}

for (const w of warn) console.log(`  주의  ${w}`);
if (problems.length) {
  console.error(`\n보안 점검 실패 (${problems.length}건):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\n고친 뒤 다시 푸시하세요. 오탐이면 해당 줄 끝에 `// security-check: allow` 를 붙이세요.');
  process.exit(1);
}
console.log(`보안 점검 통과: 파일 ${files.length}개, 테이블 ${created.size}개 RLS 확인`);
