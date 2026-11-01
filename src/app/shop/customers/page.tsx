import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { todayKst } from "@/lib/instructor/schedule";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { requestTime } from "@/lib/time";
import { CustomerForm } from "./customer-form";
import { linkCustomer, unlinkCustomer } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  level: string | null;
  equipment_size: string | null;
  tags: string[];
  memo: string | null;
  next_contact_on: string | null;
  marketing_consent: boolean;
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Customers({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const selectedId = one(sp.id);
  const isNew = one(sp.new) === "1";
  const today = todayKst(requestTime());

  const supabase = await createClient();
  let list = supabase
    .from("customers")
    .select("id, name, phone, level, tags, next_contact_on")
    .eq("shop_id", shop.id)
    .order("name")
    .limit(200);
  if (q) {
    // 이름·연락처는 부분 일치, 태그는 정확히
    const safe = q.replace(/[%,()]/g, "");
    list = list.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,tags.cs.{${safe.replace(/^#/, "")}}`);
  }
  const [{ data: rows }, { data: dueRows }, { count: total }] = await Promise.all([
    list,
    supabase.from("customers").select("id, name").eq("shop_id", shop.id).lte("next_contact_on", today).order("next_contact_on"),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
  ]);
  const customers = (rows ?? []) as Pick<Customer, "id" | "name" | "phone" | "level" | "tags" | "next_contact_on">[];
  const due = dueRows ?? [];

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <aside className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4 lg:w-80 lg:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold">손님 {total ?? 0}명</h1>
          <Link href="/shop/customers?new=1" className="flex min-h-11 items-center text-sm font-medium text-brand">
            + 손님 등록
          </Link>
        </div>
        <form>
          <input type="search" name="q" defaultValue={q} placeholder="이름 · 연락처 · 태그 검색" aria-label="손님 검색" className="min-h-11 w-full rounded-lg border border-[#CBD3E1] px-3 text-sm" />
        </form>
        {due.length > 0 && (
          <div className="rounded-[10px] bg-[#FFF1E0] p-3 text-xs text-[#7A3E06]">
            <strong>오늘 연락할 손님 {due.length}명</strong>
            <p className="mt-1">
              {due.slice(0, 5).map((d, i) => (
                <Link key={d.id} href={`/shop/customers?id=${d.id}`} className="underline">
                  {i ? ", " : ""}
                  {d.name}
                </Link>
              ))}
            </p>
          </div>
        )}
        <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/shop/customers?id=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`flex min-h-11 items-center gap-2.5 rounded-[10px] p-2.5 ${c.id === selectedId ? "bg-[#E3EBFF]" : "hover:bg-surface"}`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E3EBFF] text-sm font-bold text-brand">{c.name.slice(0, 1)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {c.name} <span className="text-[11px] font-normal text-ink-muted">{c.tags.map((t) => `#${t}`).join(" ")}</span>
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">{[c.level, c.phone].filter(Boolean).join(" · ") || "정보 없음"}</span>
                </span>
              </Link>
            </li>
          ))}
          {customers.length === 0 && <li className="p-2 text-sm text-ink-muted">손님이 없습니다.</li>}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        {isNew ? (
          <div className="rounded-[14px] border border-line bg-white p-5">
            <h2 className="mb-3 text-lg font-bold">새 손님</h2>
            <CustomerForm values={{}} />
          </div>
        ) : selectedId ? (
          <Card shopId={shop.id} id={selectedId} others={customers.filter((c) => c.id !== selectedId)} />
        ) : (
          <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">왼쪽에서 손님을 고르세요.</p>
        )}
      </section>
    </div>
  );
}

type History = {
  jobs: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    lesson_type: LessonType;
    sports: { name: string } | null;
    resorts: { name: string } | null;
    job_prices: { customer_price: number | null } | null;
    assignments: { lesson_note: string | null; instructors: { profiles: { name: string } | null } | null } | null;
  } | null;
};

async function Card({ shopId, id, others }: { shopId: string; id: string; others: { id: string; name: string }[] }) {
  const supabase = await createClient();
  const [{ data: c }, { data: hist }, { data: links }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, guardian_name, guardian_phone, level, equipment_size, tags, memo, next_contact_on, marketing_consent")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle(),
    supabase
      .from("job_customers")
      .select("jobs(id, starts_at, ends_at, status, lesson_type, sports(name), resorts(name), job_prices(customer_price), assignments(lesson_note, instructors(profiles(name))))")
      .eq("customer_id", id),
    supabase.from("customer_links").select("customer_id, linked_customer_id").or(`customer_id.eq.${id},linked_customer_id.eq.${id}`),
  ]);
  if (!c) return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">손님을 찾을 수 없습니다.</p>;
  const cust = c as Customer;
  const history = ((hist ?? []) as unknown as History[])
    .map((h) => h.jobs)
    .filter((j): j is NonNullable<History["jobs"]> => !!j)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const visits = history.filter((j) => j.status === "done" || j.status === "approved");
  const linkedIds = (links ?? []).map((l) => (l.customer_id === id ? l.linked_customer_id : l.customer_id) as string);
  const { data: linkedRows } = linkedIds.length
    ? await supabase.from("customers").select("id, name").in("id", linkedIds)
    : { data: [] as { id: string; name: string }[] };

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-line bg-white p-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#E3EBFF] text-2xl font-bold text-brand">{cust.name.slice(0, 1)}</span>
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{cust.name}</h2>
            {cust.tags.map((t) => (
              <span key={t} className="rounded-full bg-[#E3EBFF] px-2 py-0.5 text-[11px] font-medium text-brand">
                #{t}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {[cust.level, cust.phone, cust.guardian_name && `보호자 ${cust.guardian_name} ${cust.guardian_phone ?? ""}`, cust.marketing_consent ? "마케팅 수신 동의" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-sm text-[#35466A]">
            방문 {visits.length}회{visits[0] ? ` · 최근 ${visits[0].starts_at.slice(0, 10)}` : ""}
            {linkedRows && linkedRows.length > 0 && ` · 일행: ${linkedRows.map((l) => l.name).join(", ")}`}
          </p>
        </div>
        <Link href={`/shop/jobs/new?customer=${cust.id}`} className="flex min-h-11 items-center rounded-[10px] bg-brand px-4 text-sm font-medium text-white">
          강습 등록
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Box label="현재 레벨" value={cust.level ?? "—"} />
        <Box label="장비 사이즈" value={cust.equipment_size ?? "—"} />
        <Box label="다음 연락" value={cust.next_contact_on ?? "—"} warn={!!cust.next_contact_on} />
      </div>

      {cust.memo && <p className="rounded-[14px] border border-line bg-white p-4 text-sm whitespace-pre-wrap">샵 메모 · {cust.memo}</p>}

      <div className="rounded-[14px] border border-line bg-white p-5">
        <h3 className="text-base font-bold">강습 이력 · 강사 수업 메모</h3>
        {history.length === 0 && <p className="mt-2 text-sm text-ink-muted">아직 강습 이력이 없습니다.</p>}
        {history.map((j) => (
          <div key={j.id} className="grid grid-cols-[6rem_1fr] gap-3 border-t border-[#EEF1F6] py-3 first:mt-2">
            <div>
              <p className="text-sm font-bold">{j.starts_at.slice(0, 10)}</p>
              <p className="text-[11px] text-ink-muted">{j.resorts?.name}</p>
            </div>
            <div>
              <p className="text-sm">
                <Link href={`/shop/jobs/${j.id}`} className="font-medium">
                  {j.sports?.name} {LESSON_TYPES[j.lesson_type].label} · {formatLessonTime(j.starts_at, j.ends_at).split(" ")[1]}
                </Link>{" "}
                <span className="text-ink-muted">
                  · 강사 {j.assignments?.instructors?.profiles?.name ?? "—"}
                  {j.job_prices?.customer_price ? ` · ${j.job_prices.customer_price.toLocaleString("ko-KR")}원` : ""}
                  {j.status === "canceled" ? " · 취소" : ""}
                </span>
              </p>
              {j.assignments?.lesson_note && <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-sm text-[#35466A]">{j.assignments.lesson_note}</p>}
            </div>
          </div>
        ))}
        <p className="pt-2 text-xs text-ink-muted">수업 메모는 강사가 완료 보고 때 남깁니다. 다른 강사가 맡아도 이어서 가르칠 수 있도록 여기 쌓입니다.</p>
      </div>

      <details className="rounded-[14px] border border-line bg-white p-5">
        <summary className="cursor-pointer text-base font-bold">정보 고치기 · 일행</summary>
        <div className="mt-4 flex flex-col gap-5">
          <CustomerForm values={cust} />
          <div>
            <p className="text-sm font-medium">일행 (가족·친구)</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {(linkedRows ?? []).map((l) => (
                <li key={l.id} className="flex items-center gap-1 rounded-full bg-surface pl-3 text-sm">
                  {l.name}
                  <form action={unlinkCustomer}>
                    <input type="hidden" name="id" value={cust.id} />
                    <input type="hidden" name="other" value={l.id} />
                    <button aria-label={`${l.name} 일행에서 빼기`} className="min-h-11 px-3 text-ink-muted">×</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={linkCustomer} className="mt-2 flex gap-2">
              <input type="hidden" name="id" value={cust.id} />
              <select name="other" className="min-h-11 flex-1 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm">
                {others
                  .filter((o) => !linkedIds.includes(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
              <button className="min-h-11 rounded-[10px] border border-line px-4 text-sm">일행 추가</button>
            </form>
          </div>
        </div>
      </details>
    </>
  );
}

function Box({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-base font-bold ${warn ? "text-[#B4560A]" : ""}`}>{value}</p>
    </div>
  );
}
