// 로컬 Supabase DB에 SQL 한 줄을 직접 실행한다 (E2E 준비 전용). API 역할로 바꿀 수 없는 값(private.app_settings 등)만 여기서 바꾼다.
// 로컬 주소인지 먼저 확인하고(localSupabase), 로컬 DB 컨테이너(supabase_db_<project_id>)에만 들어간다. 원격 DB에는 닿지 않는다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localSupabase } from "./local-env";

function container() {
  const toml = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
  const id = /^project_id\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  if (!id) throw new Error("supabase/config.toml에 project_id가 없습니다");
  return `supabase_db_${id}`;
}

export function localSql(sql: string): string {
  localSupabase(); // 로컬이 아니면 여기서 멈춘다
  return execFileSync("docker", ["exec", "-i", container(), "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qtAc", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// AI 상담 사용권 켜짐 스위치 (P23-2). 시험 안에서만 켜고, 끝나면 반드시 false로 되돌린다
export function setConsultLicenseRequired(on: boolean) {
  localSql(`update private.app_settings set value = '${on ? "true" : "false"}' where key = 'consult_license_required'`);
}
