import { execSync } from "node:child_process";
import { localSupabase } from "./local-env";

// 로컬 DB를 마이그레이션+시드 상태로 되돌린다 (로컬 전용, 원격은 --linked가 없어 건드리지 않는다)
export default function globalSetup() {
  localSupabase();
  execSync("npx supabase db reset --local", { stdio: "inherit" });
}
