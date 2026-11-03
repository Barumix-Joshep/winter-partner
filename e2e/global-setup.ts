import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";
import { localSupabase, supabaseBin } from "./local-env";
import { setAiFeatures } from "./ai";
import { PASSWORD } from "./helpers";
import { warmUp } from "./warmup";

// 로컬 DB를 마이그레이션+시드 상태로 되돌린다 (로컬 전용, 원격은 --linked가 없어 건드리지 않는다)
export default async function globalSetup(config: FullConfig) {
  localSupabase();
  execSync(`${supabaseBin()} db reset --local`, { stdio: "inherit" });
  // 기존 E2E는 AI 끈 상태로 돈다 (CLAUDE.md AI 원칙)
  await setAiFeatures(false);
  // 모든 경로를 한 번씩 열어 개발 서버 컴파일을 테스트 전에 끝낸다 (P19-4). E2E_WARMUP=0이면 건너뛴다(한 파일만 빨리 돌릴 때).
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL && process.env.E2E_WARMUP !== "0") await warmUp(baseURL, PASSWORD);
}
