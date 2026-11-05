#!/usr/bin/env node
// 운영 테스트 데이터 세기 (docs/test-data-cleanup.md "삭제 전에 먼저 세어 보기").
//
// ★ 이 스크립트는 아무것도 지우지 않는다. 읽기만 한다. ★
//   - 쓰는 것은 select(건수만: count + head, 또는 id 목록)와 auth.admin.listUsers, storage 목록 보기뿐이다.
//   - insert·update·delete·upsert·rpc는 한 줄도 없다. 삭제는 scripts/rehearsal/prod-cleanup.sql 2단계(사장님 승인 뒤)로만 한다.
//
// 실행: node --env-file=.env.local scripts/ops/test-data-report.mjs
//   필요한 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (값은 화면에 찍지 않는다)
// 출력: 마크다운 표 (표, 조건, 행 수). 개인정보·id는 찍지 않고 건수만 찍는다.
//
// 테스트 데이터 기준 (docs/test-data-cleanup.md):
//   - 샵: 이름이 "[테스트]"로 시작
//   - 계정: 이메일이 "@winter-partner.test"로 끝남
//   - 위 샵(shop_id)·계정(user_id)에 연결된 행
// "남아야 함" 줄은 테스트가 아닌 진짜 샵·계정 수다. 지우기 전에 이 숫자가 정리 뒤에도 그대로인지 본다.
import { createClient } from "@supabase/supabase-js";

const TEST_SHOP_PREFIX = "[테스트]";
const TEST_EMAIL_SUFFIX = "@winter-partner.test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 없습니다. node --env-file=.env.local 로 실행하세요.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = []; // { table, cond, count }
const add = (table, cond, count) => rows.push({ table, cond, count });

// 건수만 센다 (head: true → 행 내용은 받지 않음). 표가 아직 없으면 "표 없음"으로 적는다.
async function count(table, apply) {
  const q = apply(db.from(table).select("*", { count: "exact", head: true }));
  const { count: n, error } = await q;
  if (error) return error.code === "42P01" || error.code === "PGRST205" ? "표 없음" : `오류(${error.code ?? "?"})`;
  return n ?? 0;
}

async function ids(table, apply) {
  const { data, error } = await apply(db.from(table).select("id"));
  if (error) throw new Error(`${table} 읽기 실패 (${error.code ?? "?"})`);
  return (data ?? []).map((r) => r.id);
}

// 빈 목록이면 조회하지 않고 0
const byIds = async (table, col, list) => (list.length ? count(table, (q) => q.in(col, list)) : 0);

// 1. 계정 (auth.admin.listUsers — 읽기)
const users = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`계정 목록 읽기 실패 (${error.code ?? error.status ?? "?"})`);
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const testUserIds = users.filter((u) => u.email?.endsWith(TEST_EMAIL_SUFFIX)).map((u) => u.id);

// 2. 샵
const testShopIds = await ids("shops", (q) => q.like("name", `${TEST_SHOP_PREFIX}%`));

add("shops", `이름이 ${TEST_SHOP_PREFIX}로 시작`, testShopIds.length);
add("auth.users", `이메일이 ${TEST_EMAIL_SUFFIX}로 끝남`, testUserIds.length);

// 3. 샵에 딸린 표 (shop_id)
const SHOP_TABLES = [
  "shop_members", "shop_resorts", "customers", "customer_contacts", "customer_consents", "consent_links",
  "customer_erasures", "registration_links", "health_warnings", "access_logs", "inquiries", "jobs",
  "exclusive_invites", "shop_instructors", "shop_instructor_pay_type_log", "lesson_corrections",
  "shop_change_requests", "audit_events", "shop_channels", "shop_consult_settings", "shop_knowledge",
  "conversations", "messages", "ai_feedback",
];
for (const t of SHOP_TABLES) add(t, "테스트 샵의 행 (shop_id)", await byIds(t, "shop_id", testShopIds));

// 정산: 샵 정산(shop_id) 또는 팀 지급(payee_shop_id)
let settlementIds = [];
if (testShopIds.length) {
  const list = testShopIds.join(",");
  settlementIds = await ids("settlements", (q) => q.or(`shop_id.in.(${list}),payee_shop_id.in.(${list})`));
}
add("settlements", "테스트 샵의 정산 (shop_id 또는 payee_shop_id)", settlementIds.length);
add("settlement_items", "위 정산의 항목", await byIds("settlement_items", "settlement_id", settlementIds));

// 4. 계정에 딸린 표 (user_id)
for (const t of ["profiles", "instructors", "notifications", "push_subscriptions", "feedback"]) {
  const col = t === "profiles" ? "id" : "user_id";
  add(t, `테스트 계정의 행 (${col})`, await byIds(t, col, testUserIds));
}

// AI 사용: 테스트 샵 또는 테스트 계정
if (testShopIds.length || testUserIds.length) {
  const parts = [];
  if (testShopIds.length) parts.push(`shop_id.in.(${testShopIds.join(",")})`);
  if (testUserIds.length) parts.push(`user_id.in.(${testUserIds.join(",")})`);
  add("ai_usage", "테스트 샵 또는 테스트 계정", await count("ai_usage", (q) => q.or(parts.join(","))));
} else add("ai_usage", "테스트 샵 또는 테스트 계정", 0);

// 5. 자격증 파일 (storage certs/<테스트 강사 id>/ — 목록 보기만)
const instIds = testUserIds.length ? await ids("instructors", (q) => q.in("user_id", testUserIds)) : [];
let certFolders = 0;
let certFiles = 0;
for (const id of instIds) {
  const { data, error } = await db.storage.from("certs").list(id, { limit: 100 });
  if (error) continue;
  if (data?.length) {
    certFolders++;
    certFiles += data.length;
  }
}
add("storage certs", "테스트 강사 폴더 수", certFolders);
add("storage certs", "테스트 강사 폴더 안 파일 수", certFiles);

// 6. 남아야 하는 것 (진짜 샵·계정) — 정리 전후로 같아야 한다
add("shops", `남아야 함: 이름이 ${TEST_SHOP_PREFIX}로 시작하지 않음`, await count("shops", (q) => q.not("name", "like", `${TEST_SHOP_PREFIX}%`)));
add("auth.users", `남아야 함: 이메일이 ${TEST_EMAIL_SUFFIX}가 아님`, users.length - testUserIds.length);
// 점검: 테스트 샵 밖에 [테스트] 이름 손님이 있으면 기준이 어긋난 것
add(
  "customers",
  `점검: 테스트 샵 밖인데 이름이 ${TEST_SHOP_PREFIX}로 시작 (0이어야 함)`,
  await count("customers", (q) => {
    const r = q.like("name", `${TEST_SHOP_PREFIX}%`);
    return testShopIds.length ? r.not("shop_id", "in", `(${testShopIds.join(",")})`) : r;
  }),
);

console.log(`## 테스트 데이터 건수 (읽기만, ${new Date().toISOString().slice(0, 10)})\n`);
console.log("| 표 | 조건 | 행 수 |");
console.log("|---|---|---|");
for (const r of rows) console.log(`| ${r.table} | ${r.cond} | ${r.count} |`);
console.log("\n이 스크립트는 아무것도 지우지 않았습니다. 삭제는 docs/test-data-cleanup.md 순서대로, 사장님 승인 뒤에만 합니다.");
