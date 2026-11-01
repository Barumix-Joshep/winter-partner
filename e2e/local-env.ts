// E2E는 로컬 Supabase(npx supabase start)에만 붙는다. 원격 프로젝트를 건드리지 않도록 주소를 확인한다.
import { execSync } from "node:child_process";

export type LocalEnv = { url: string; anonKey: string; serviceKey: string };

let cached: LocalEnv | undefined;

export function localSupabase(): LocalEnv {
  if (cached) return cached;
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const s = JSON.parse(out.slice(out.indexOf("{")));
  const url: string = s.API_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`로컬 Supabase가 아닙니다: ${url}`);
  cached = { url, anonKey: s.ANON_KEY, serviceKey: s.SERVICE_ROLE_KEY };
  return cached;
}
