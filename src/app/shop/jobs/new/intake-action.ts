"use server";

import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { redact, restore, hasContact } from "@/lib/ai/redact";
import { INTAKE_SCHEMA, INTAKE_TOOL, intakeSystem, normalizeIntake, parseIntake } from "@/lib/ai/intake";
import { todayKst } from "@/lib/instructor/schedule";
import type { JobPrefill } from "./prefill";

export type IntakeState = { prefill?: JobPrefill; message?: string };

// 문자·카톡 접수 글 → 강습 등록 칸 제안. DB에는 아무것도 쓰지 않는다(저장은 사장님이 폼에서).
// 연락처·이메일은 지우고, 우리 샵 손님 이름은 손님A로 바꿔 보낸다.
export async function extractIntake(_prev: IntakeState | undefined, formData: FormData): Promise<IntakeState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) return { message: "샵을 먼저 등록해 주세요." };
  const raw = String(formData.get("intake") ?? "").slice(0, 2000).trim();
  if (raw.length < 5) return { message: "접수 글을 붙여 넣어 주세요." };
  if (!(await isAiEnabled(shop.id, "intake"))) return { message: "지금은 자동 입력을 쓸 수 없습니다. 직접 입력해 주세요." };

  const supabase = await createClient();
  const [{ data: sports }, { data: customers }] = await Promise.all([
    supabase.from("sports").select("id, name").order("id"),
    supabase.from("customers").select("id, name").eq("shop_id", shop.id).is("anonymized_at", null).limit(1000),
  ]);
  const sportList = (sports ?? []) as { id: number; name: string }[];
  const known = (customers ?? []) as { id: string; name: string }[];
  // 글에 나온 우리 손님만 치환 대상으로 (이름 목록 전체를 보내지 않는다)
  const mentioned = known.filter((c) => c.name.length >= 2 && raw.includes(c.name));
  const r = redact(raw, mentioned.map((c) => c.name));
  if (hasContact(r.text)) return { message: "연락처를 지우지 못해 자동 입력을 멈췄습니다. 직접 입력해 주세요." };

  const today = todayKst(Date.now());
  const result = await callStructured({
    feature: "intake",
    shopId: shop.id,
    userId: user.id,
    system: intakeSystem(today, sportList.map((s) => s.name), shop.resorts.map((x) => x.name)),
    content: r.text,
    toolName: INTAKE_TOOL,
    schema: INTAKE_SCHEMA,
    parse: (x) => parseIntake(x, sportList.map((s) => s.name)),
    maxTokens: 600,
  });
  if (!result) return { message: "내용을 읽지 못했습니다. 직접 입력해 주세요." };
  const n = normalizeIntake(result, today);
  const name = n.customerName ? restore(n.customerName, r.aliases) : null;
  const match = name ? known.find((c) => c.name === name) : undefined;
  const resort = shop.resorts.find((x) => raw.includes(x.name));
  return {
    prefill: {
      resortId: resort?.id ?? null,
      sportId: sportList.find((s) => s.name === n.sport)?.id ?? null,
      date: n.date,
      start: n.start,
      end: n.end,
      lessonType: n.lessonType,
      studentCount: n.studentCount,
      level: n.level,
      note: n.note,
      patchPaidBy: n.patchPaidBy,
      customerId: match?.id ?? null,
      newCustomerName: match ? null : name,
      uncertain: n.uncertain,
    },
  };
}
