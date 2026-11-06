import "server-only";
import { createClient } from "@/lib/supabase/server";
import { licenseView, parseUsage, type LicenseUsage, type LicenseView } from "./license";

// 샵 화면이 읽는 AI 상담 사용권·이번 달 사용량 (P23-2). 로그인한 샵 멤버 권한으로 consult_my_usage를 부른다.
// 함수가 없거나(원격 적용 전) 오류면 null → 화면은 지금처럼 동작한다(막는 것은 DB가 한다).
export async function myConsultLicense(shopId: string): Promise<LicenseUsage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consult_my_usage", { p_shop_id: shopId });
  if (error) return null;
  return parseUsage(data);
}

// 화면 표시용 (요청 때 서버에서 한 번 판단한다). 켜짐 스위치가 꺼져 있으면 show=false
export async function myConsultLicenseView(shopId: string): Promise<LicenseView | null> {
  const u = await myConsultLicense(shopId);
  return u ? licenseView(u, Date.now()) : null;
}
