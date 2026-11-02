import type { Instrumentation } from "next";

// 서버 오류를 운영 기록에 남긴다(P16-2). 한 시간에 일정 건수가 넘으면 DB가 본사 관리자에게 알린다.
// 주소는 실제 경로가 아니라 라우트 틀(/shop/jobs/[id])로 남겨 개인 식별 값이 들어가지 않게 한다.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ recordOpsEvent }, { errorDetail }] = await Promise.all([import("@/lib/ops/record"), import("@/lib/ops/event")]);
  const source = `${request.method} ${context.routePath} (${context.routeType})`;
  await recordOpsEvent("server_error", source, errorDetail(err), false);
};
