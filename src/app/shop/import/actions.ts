"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { parseCsv } from "@/lib/import/csv";
import { checkCustomerRows } from "@/lib/import/customers";
import { checkInstructorRows } from "@/lib/import/instructors";
import { kstYear } from "@/lib/customer/minor";
import { siteOrigin } from "@/lib/origin";

export type PreviewRow = { line: number; name: string; contact: string; status: "ok" | "skip" | "error"; reason: string };
export type ImportState = {
  type: "customers" | "instructors";
  csv?: string;
  rows?: PreviewRow[];
  okCount?: number;
  fileError?: string;
  done?: { added: number; skipped: number; notJoined?: string[]; signupUrl?: string };
  message?: string;
};

const MAX_BYTES = 1_000_000;

async function context() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) throw new Error("샵이 없습니다");
  return { user, shop, supabase: await createClient() };
}

// 이 샵에 이미 있는 손님 연락처 (중복 방지)
async function existingPhones(supabase: Awaited<ReturnType<typeof createClient>>, shopId: string) {
  const { data } = await supabase.from("customers").select("phone").eq("shop_id", shopId).not("phone", "is", null).limit(20000);
  return new Set((data ?? []).map((r) => r.phone as string));
}

const STATE_LABEL: Record<string, string> = {
  available: "가입한 강사 · 전속 초대를 보냅니다",
  invited: "이미 초대를 보냈습니다",
  mine: "이미 우리 전속입니다",
  other_exclusive: "다른 샵 전속이라 초대할 수 없습니다",
};

async function checkInstructors(csv: string, shopId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const checked = checkInstructorRows(parseCsv(csv));
  if (checked.fileError) return { fileError: checked.fileError };
  const valid = checked.rows.filter((r) => r.data && !r.skip && r.errors.length === 0);
  const { data: matches, error } = await supabase.rpc("import_match_instructors", {
    p_shop_id: shopId,
    p_emails: valid.map((r) => r.data!.email ?? ""),
    p_phones: valid.map((r) => r.data!.phone ?? ""),
  });
  if (error) return { fileError: "강사를 찾지 못했습니다. 잠시 후 다시 시도해 주세요." };
  const byLine = new Map(valid.map((r, i) => [r.line, (matches ?? [])[i] as { instructor_id: string | null; name: string | null; state: string | null }]));
  const rows: (PreviewRow & { instructorId?: string })[] = checked.rows.map((r) => {
    const base = { line: r.line, name: r.values.name ?? "", contact: [r.values.phone, r.values.email].filter(Boolean).join(" · ") };
    if (r.errors.length) return { ...base, status: "error", reason: r.errors.join(" ") };
    if (r.skip) return { ...base, status: "skip", reason: r.skip };
    const m = byLine.get(r.line);
    if (!m?.state) return { ...base, status: "skip", reason: "아직 가입하지 않았습니다 · 가입 안내가 필요합니다" };
    if (m.state !== "available") return { ...base, status: "skip", reason: STATE_LABEL[m.state] };
    return { ...base, status: "ok", reason: `${STATE_LABEL.available} (가입 이름: ${m.name})`, instructorId: m.instructor_id ?? undefined };
  });
  return { rows };
}

function customerPreview(csv: string, phones: Set<string>) {
  const checked = checkCustomerRows(parseCsv(csv), phones, kstYear(Date.now()));
  if (checked.fileError) return { fileError: checked.fileError, checked };
  const rows: PreviewRow[] = checked.rows.map((r) => ({
    line: r.line,
    name: r.values.name ?? "",
    contact: r.values.phone || r.values.guardian_phone || "",
    status: r.errors.length ? "error" : r.skip ? "skip" : "ok",
    reason: r.errors.join(" ") || r.skip || "등록합니다",
  }));
  return { rows, checked };
}

// 1단계: 미리보기 (아무것도 저장하지 않는다)
export async function previewImport(prev: ImportState, formData: FormData): Promise<ImportState> {
  const type = prev.type;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { type, fileError: "파일을 골라 주세요." };
  if (file.size > MAX_BYTES) return { type, fileError: "파일이 너무 큽니다 (1MB까지)." };
  const csv = await file.text();
  const { shop, supabase } = await context();
  if (type === "instructors") {
    const r = await checkInstructors(csv, shop.id, supabase);
    if (r.fileError) return { type, fileError: r.fileError };
    const rows: PreviewRow[] = r.rows!.map((x) => ({ line: x.line, name: x.name, contact: x.contact, status: x.status, reason: x.reason }));
    return { type, csv, rows, okCount: rows.filter((x) => x.status === "ok").length };
  }
  const r = customerPreview(csv, await existingPhones(supabase, shop.id));
  if (r.fileError) return { type, fileError: r.fileError };
  return { type, csv, rows: r.rows, okCount: r.checked.okCount };
}

// 2단계: 등록 (서버에서 다시 확인한 정상 행만)
export async function commitImport(prev: ImportState, formData: FormData): Promise<ImportState> {
  const type = prev.type;
  const csv = String(formData.get("csv") ?? "");
  if (csv.length > MAX_BYTES) return { type, fileError: "파일이 너무 큽니다 (1MB까지)." };
  if (type === "customers" && formData.get("notice") !== "on") {
    return { ...prev, message: "손님에게 개인정보 수집·이용을 안내했는지 확인해 주세요." };
  }
  const { user, shop, supabase } = await context();
  if (type === "instructors") {
    const r = await checkInstructors(csv, shop.id, supabase);
    if (r.fileError) return { type, fileError: r.fileError };
    const targets = r.rows!.filter((x) => x.status === "ok" && x.instructorId);
    let added = 0;
    for (const t of targets) {
      const { error } = await supabase.from("exclusive_invites").insert({ shop_id: shop.id, instructor_id: t.instructorId });
      if (!error) added += 1;
    }
    const notJoined = r.rows!.filter((x) => x.reason.startsWith("아직 가입")).map((x) => x.name);
    revalidatePath("/shop/team");
    revalidatePath("/shop");
    return { type, done: { added, skipped: r.rows!.length - added, notJoined, signupUrl: `${await siteOrigin()}/login` } };
  }
  const { checked, fileError } = customerPreview(csv, await existingPhones(supabase, shop.id));
  if (fileError) return { type, fileError };
  const data = checked.rows.filter((x) => x.data && !x.skip && x.errors.length === 0).map((x) => ({ ...x.data!, shop_id: shop.id, owner_user_id: user.id }));
  if (data.length) {
    const { error } = await supabase.from("customers").insert(data);
    if (error) return { ...prev, message: "등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/shop/customers");
  return { type, done: { added: data.length, skipped: checked.rows.length - data.length } };
}
