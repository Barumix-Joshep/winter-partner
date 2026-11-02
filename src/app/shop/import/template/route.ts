import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/import/csv";
import { CUSTOMER_TEMPLATE } from "@/lib/import/customers";
import { INSTRUCTOR_TEMPLATE } from "@/lib/import/instructors";

// 일괄 등록 양식 (열 이름 + [테스트] 예시 한 줄). 개인정보가 없어 로그인 없이 받는다.
export function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") === "instructors" ? "instructors" : "customers";
  const body = toCsv(type === "instructors" ? INSTRUCTOR_TEMPLATE : CUSTOMER_TEMPLATE);
  const filename = type === "instructors" ? "강사_등록_양식.csv" : "손님_등록_양식.csv";
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
