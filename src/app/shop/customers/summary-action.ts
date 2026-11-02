"use server";

import { createHash } from "node:crypto";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyShop } from "@/lib/shop/my-shop";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { parseSummary, SUMMARY_SCHEMA, SUMMARY_SYSTEM, SUMMARY_TOOL, summaryPrompt, type CustomerSummary } from "@/lib/ai/customer-summary";
import { CONTACT_CHANNELS, type ContactChannel } from "@/lib/customer/contact";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";

export type SummaryState = { summary?: CustomerSummary; at?: string; message?: string };

const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);

// 손님 카드 요약: 입력이 바뀌었을 때만 새로 만들고, 아니면 저장된 요약을 돌려준다
export async function summarizeCustomer(_prev: SummaryState | undefined, formData: FormData): Promise<SummaryState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  const id = String(formData.get("id") ?? "");
  const force = formData.get("force") === "1";
  if (!shop || !(await isAiEnabled(shop.id, "customer_summary"))) return { message: "지금은 요약을 쓸 수 없습니다." };

  const supabase = await createClient();
  const [{ data: c }, { data: hist }, { data: contacts }, { data: consent }, { data: links }] = await Promise.all([
    supabase.from("customers").select("id, name, level, memo, ai_summary, ai_summary_at").eq("id", id).eq("shop_id", shop.id).is("anonymized_at", null).maybeSingle(),
    supabase.from("job_customers").select("jobs(starts_at, status, lesson_type, sports(name), assignments(lesson_note))").eq("customer_id", id),
    supabase.from("customer_contacts").select("channel, memo, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("customer_consent_state").select("valid").eq("customer_id", id).eq("kind", "marketing").maybeSingle(),
    supabase.from("customer_links").select("customer_id, linked_customer_id").or(`customer_id.eq.${id},linked_customer_id.eq.${id}`),
  ]);
  if (!c) return { message: "손님을 찾을 수 없습니다." };
  const linkedIds = (links ?? []).map((l) => (l.customer_id === id ? l.linked_customer_id : l.customer_id) as string);
  const { data: linked } = linkedIds.length ? await supabase.from("customers").select("name").in("id", linkedIds) : { data: [] as { name: string }[] };

  type H = { jobs: { starts_at: string; status: string; lesson_type: LessonType; sports: { name: string } | null; assignments: { lesson_note: string | null } | null } | null };
  const lessons = ((hist ?? []) as unknown as H[])
    .map((h) => h.jobs)
    .filter((j): j is NonNullable<H["jobs"]> => !!j)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((j) => ({ date: kstDay(j.starts_at), sport: j.sports?.name ?? null, lesson: LESSON_TYPES[j.lesson_type].label, status: j.status, note: j.assignments?.lesson_note ?? null }));
  const marketingOk = !!consent?.valid;
  const input = {
    name: c.name as string,
    linkedNames: (linked ?? []).map((l) => l.name as string),
    level: c.level as string | null,
    memo: c.memo as string | null,
    lessons,
    contacts: ((contacts ?? []) as { channel: ContactChannel; memo: string | null; created_at: string }[]).map((k) => ({ date: kstDay(k.created_at), channel: CONTACT_CHANNELS[k.channel], memo: k.memo })),
    marketingOk,
  };
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
  const cached = c.ai_summary as (CustomerSummary & { source_hash?: string }) | null;
  if (!force && cached?.source_hash === hash) {
    return { summary: { summary: cached.summary, nextLesson: cached.nextLesson, contactDraft: marketingOk ? cached.contactDraft : null }, at: c.ai_summary_at as string };
  }
  if (lessons.length === 0 && !input.memo && input.contacts.length === 0) return { message: "아직 요약할 기록이 없습니다." };

  const { text, aliases } = summaryPrompt(input);
  const r = await callStructured({
    feature: "customer_summary",
    shopId: shop.id,
    userId: user.id,
    system: SUMMARY_SYSTEM,
    content: text,
    toolName: SUMMARY_TOOL,
    schema: SUMMARY_SCHEMA,
    parse: (x) => parseSummary(x, aliases, marketingOk),
    maxTokens: 600,
  });
  if (!r) return cached ? { summary: cached, at: c.ai_summary_at as string, message: "새 요약을 만들지 못해 이전 요약을 보여 드립니다." } : { message: "요약을 만들지 못했습니다." };
  await createAdminClient().rpc("save_customer_summary", { p_customer_id: id, p_summary: { ...r, source_hash: hash } });
  return { summary: r, at: new Date().toISOString() };
}
