// 웹푸시 실패를 로그에 남길 때 쓸 요약 (P19-3). web-push 오류 객체에는 구독 주소(endpoint)·응답 본문이 들어 있어
// 그대로 찍으면 기기 식별 값이 로그에 남는다. 종류와 상태 코드만 남긴다.
export function pushErrorSummary(e: unknown) {
  if (e && typeof e === "object") {
    const o = e as { name?: unknown; statusCode?: unknown; code?: unknown };
    const name = typeof o.name === "string" ? o.name : "Error";
    const status = typeof o.statusCode === "number" ? o.statusCode : typeof o.code === "string" ? o.code : "-";
    return `${name} ${status}`;
  }
  return typeof e;
}
