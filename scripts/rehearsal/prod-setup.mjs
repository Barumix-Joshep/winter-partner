#!/usr/bin/env node
// P15 운영 실호출 스모크용 테스트 데이터 (운영 DB). 여러 번 돌려도 같은 결과(있으면 건너뜀).
// - 모든 이름 앞에 "[테스트]", 연락처는 010-0000-9xxx, 이메일은 @winter-partner.test (메일이 가지 않는 도메인)
// - 테스트 샵·테스트 계정에만 연결한다. 지우는 절차: docs/test-data-cleanup.md
// - 비밀번호는 .env.rehearsal.local(REHEARSAL_PASSWORD, git 제외)에만. 화면·로그에 출력하지 않는다.
// 실행: node --env-file=.env.local --env-file=.env.rehearsal.local scripts/rehearsal/prod-setup.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.REHEARSAL_PASSWORD;
if (!url || !key || !password) throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REHEARSAL_PASSWORD가 필요합니다");
const db = createClient(url, key, { auth: { persistSession: false } });

export const DOMAIN = "winter-partner.test";
const ACCOUNTS = [
  { email: `test-admin@${DOMAIN}`, role: "instructor", name: "[테스트] 본사 확인용" }, // 비교 화면 확인 때만 잠깐 관리자로
  { email: `test-rental@${DOMAIN}`, role: "shop_admin", name: "[테스트] 렌탈 사장" },
  { email: `test-team@${DOMAIN}`, role: "shop_admin", name: "[테스트] 강습팀장" },
  { email: `test-inst1@${DOMAIN}`, role: "instructor", name: "[테스트] 강사가" },
  { email: `test-inst2@${DOMAIN}`, role: "instructor", name: "[테스트] 강사나" },
  { email: `test-inst3@${DOMAIN}`, role: "instructor", name: "[테스트] 강사다" },
  { email: `test-inst4@${DOMAIN}`, role: "instructor", name: "[테스트] 강사라" },
];

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function user(a) {
  const list = must(await db.auth.admin.listUsers({ perPage: 1000 }), "listUsers");
  const found = list.users.find((u) => u.email === a.email);
  if (found) return found.id;
  const created = must(
    await db.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { role: a.role, name: a.name, agreed: true } }),
    `createUser ${a.email}`,
  );
  return created.user.id;
}

async function one(table, match, row) {
  const q = db.from(table).select("id");
  for (const [k, v] of Object.entries(match)) q.eq(k, v);
  const existing = must(await q.maybeSingle(), `${table} select`);
  if (existing) return existing.id;
  return must(await db.from(table).insert(row).select("id").single(), `${table} insert`).id;
}

const ids = {};
for (const a of ACCOUNTS) ids[a.email.split("@")[0]] = await user(a);

const resort = must(await db.from("resorts").select("id").eq("name", "하이원").single(), "resort").id;
const ski = must(await db.from("sports").select("id").eq("name", "스키").single(), "sport").id;

const rental = await one("shops", { name: "[테스트] 하이원 렌탈" }, { name: "[테스트] 하이원 렌탈", type: "rental_shop", status: "approved", business_no: "000-00-90001", owner_name: "[테스트] 렌탈 사장", created_by: ids["test-rental"] });
const team = await one("shops", { name: "[테스트] 하이원 강습팀" }, { name: "[테스트] 하이원 강습팀", type: "lesson_team", status: "approved", business_no: "000-00-90002", owner_name: "[테스트] 강습팀장", created_by: ids["test-team"] });
for (const s of [rental, team]) await db.from("shop_resorts").upsert({ shop_id: s, resort_id: resort });

// 강사: 하이원·스키, 강사가·나는 자격 검증됨, 강사다는 검증 전
const inst = {};
for (const k of ["test-inst1", "test-inst2", "test-inst3", "test-inst4"]) {
  inst[k] = must(await db.from("instructors").select("id").eq("user_id", ids[k]).single(), "instructor").id;
  await db.from("instructors").update({ base_rate: 80000, bio: "[테스트] 가상 강사" }).eq("id", inst[k]);
  await db.from("instructor_sports").upsert({ instructor_id: inst[k], sport_id: ski });
  await db.from("instructor_resorts").upsert({ instructor_id: inst[k], resort_id: resort });
}
for (const [k, grade] of [["test-inst1", "Level 2"], ["test-inst2", "Level 1"]]) {
  await one("instructor_certs", { instructor_id: inst[k], issuer: "KSIA" }, { instructor_id: inst[k], issuer: "KSIA", grade, status: "approved", verified_at: new Date().toISOString() });
}

// 손님 3명 (렌탈샵)
const cust = {};
for (const [k, name, phone, level, memo] of [
  ["c1", "[테스트] 손님일", "010-0000-9001", "초급", "동생과 같이 오면 집중 잘함. 리프트 혼자 타기 연습 중"],
  ["c2", "[테스트] 손님이", "010-0000-9002", "중급", "카빙 배우고 싶어 함"],
  ["c3", "[테스트] 손님삼", "010-0000-9003", "입문", null],
]) {
  cust[k] = await one("customers", { shop_id: rental, name }, { shop_id: rental, name, phone, level, memo, owner_user_id: ids["test-rental"] });
}
// 손님이: 본인이 QR에서 한 광고 동의 (손님삼은 동의 없음)
const { data: hasConsent } = await db.from("customer_consents").select("id").eq("customer_id", cust.c2).limit(1);
if (!hasConsent?.length) {
  must(await db.from("customer_consents").insert({ shop_id: rental, customer_id: cust.c2, kind: "marketing", granted: true, subject: "self", method: "qr", text_version: "marketing-2026-11-v1" }), "consent");
}

// 지난 시즌 승인된 강습과 수업 메모 (손님마다 1건)
const day = (d) => new Date(Date.parse(d)).toISOString();
for (const [k, when, note, who] of [
  ["c1", "2026-02-07T10:00:00+09:00", "[테스트] 플루그보겐 좌우 가능, 다음엔 연속 턴", "test-inst1"],
  ["c2", "2026-02-14T13:00:00+09:00", "[테스트] 패러렐 기초, 상체 회전이 큼", "test-inst2"],
  ["c3", "2026-02-21T10:00:00+09:00", "[테스트] 장비 착용과 걷기", "test-inst1"],
]) {
  const jid = await one("jobs", { shop_id: rental, note: `[테스트] 지난 강습 ${k}` }, {
    shop_id: rental, resort_id: resort, sport_id: ski, starts_at: day(when), ends_at: day(new Date(Date.parse(when) + 2 * 3600_000).toISOString()),
    lesson_type: "private", student_count: 1, instructor_rate: 80000, assign_mode: "direct", status: "approved", note: `[테스트] 지난 강습 ${k}`,
  });
  await db.from("job_customers").upsert({ job_id: jid, customer_id: cust[k] });
  const { data: asg } = await db.from("assignments").select("id").eq("job_id", jid).maybeSingle();
  if (!asg) must(await db.from("assignments").insert({ job_id: jid, instructor_id: inst[who], final_rate: 80000, lesson_note: note, completed_at: day(when), approved_at: day(when) }), "assignment");
}

// 입찰 3건이 붙은 공고 (A3): 강사가·강사나 + 강습팀
const closes = new Date(Date.now() + 20 * 86400_000).toISOString();
const starts = new Date(Date.now() + 25 * 86400_000);
const bidJob = await one("jobs", { shop_id: rental, note: "[테스트] 입찰 공고 · 어린이 둘 처음" }, {
  shop_id: rental, resort_id: resort, sport_id: ski, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 2 * 3600_000).toISOString(),
  lesson_type: "semi", student_count: 2, instructor_rate: 150000, assign_mode: "bid", allow_team_bids: true, bid_closes_at: closes, status: "open",
  note: "[테스트] 입찰 공고 · 어린이 둘 처음",
});
await db.from("job_customers").upsert({ job_id: bidJob, customer_id: cust.c1 });
const { data: bids } = await db.from("bids").select("id").eq("job_id", bidJob);
if (!bids?.length) {
  must(await db.from("bids").insert([
    { job_id: bidJob, bidder_type: "instructor", instructor_id: inst["test-inst1"], amount: 140000, memo: "[테스트] 어린이 강습 경험 많아요" },
    { job_id: bidJob, bidder_type: "instructor", instructor_id: inst["test-inst2"], amount: 60000, memo: "[테스트] 싸게 해 드려요 010-0000-9999" },
    { job_id: bidJob, bidder_type: "shop", bidder_shop_id: team, amount: 130000, memo: "[테스트] 강사 2명 투입" },
  ]), "bids");
}

console.log(JSON.stringify({ ok: true, shops: 2, accounts: ACCOUNTS.length, customers: 3, bidJob }));
