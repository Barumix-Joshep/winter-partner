#!/usr/bin/env node
// 테스트 강사(@winter-partner.test)의 자격증 파일 목록 (기본) / --execute 로 삭제. docs/test-data-cleanup.md 3단계.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const execute = process.argv.includes("--execute");
const { data: u } = await db.auth.admin.listUsers({ perPage: 1000 });
const testIds = u.users.filter((x) => x.email?.endsWith("@winter-partner.test")).map((x) => x.id);
const { data: inst } = await db.from("instructors").select("id").in("user_id", testIds);
const paths = [];
for (const { id } of inst ?? []) {
  const { data: files } = await db.storage.from("certs").list(id, { limit: 100 });
  for (const f of files ?? []) paths.push(`${id}/${f.name}`);
}
console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", files: paths.length }));
if (execute && paths.length) {
  const { error } = await db.storage.from("certs").remove(paths);
  if (error) throw error;
  console.log("deleted");
}
