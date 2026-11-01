import { connection } from "next/server";

// 요청 시각. 프리렌더(런타임 프리페치 포함)에서 현재 시각을 읽지 않도록 요청이 올 때까지 기다린다.
export async function requestTime() {
  await connection();
  return Date.now();
}
