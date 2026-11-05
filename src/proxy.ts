import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

// 요청마다 Supabase 세션을 갱신해 쿠키에 다시 쓴다. 접근 제어는 페이지와 RLS가 맡는다.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims가 만료된 토큰을 갱신한다. 이 호출과 createServerClient 사이에 다른 코드를 넣지 않는다.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // 정적 파일·서비스 워커·매니페스트·오프라인 셸은 세션 갱신이 필요 없다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
