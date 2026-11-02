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
import { deleteContact, dismissMerge, linkCustomer, mergeCustomer, recordStaffConsent, unlinkCustomer } from "./actions";
import { CONSENT_METHOD_LABEL, CONSENT_SUBJECT_LABEL, OPTIONAL_CONSENTS, type OptionalConsentKind } from "@/lib/privacy/texts";
import { ContactForm } from "./contact-form";
import { ConsentLink } from "./consent-link";
import { EraseForm } from "./erase-form";
import { SummaryBox } from "./summary-box";
import { isAiEnabled } from "@/lib/ai/flags";
import { isMinor, kstYear } from "@/lib/customer/minor";
import { logAccess } from "@/lib/audit";
import { CONTACT_CHANNELS, formatDay, type ContactChannel } from "@/lib/customer/contact";

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
  next_contact_note: string | null;
  birth_year: number | null;
  source: "staff" | "self";
  merge_candidate_id: string | null;
  anonymized_at: string | null;
  owner: { name: string } | null;
};

type ConsentState = { kind: string; granted: boolean; subject: string; method: string; created_at: string; valid: boolean; needs_recheck: boolean };

// 선택 동의 상태 문구: 유효한 것은 손님(보호자)이 직접 한 동의뿐
function consentLabel(s: ConsentState | undefined): { text: string; cls: string } {
  if (!s) return { text: "기록 없음", cls: "text-ink-muted" };
  const when = s.created_at.slice(0, 10);
  const how = `${CONSENT_SUBJECT_LABEL[s.subject]} · ${CONSENT_METHOD_LABEL[s.method]} · ${when}`;
  if (!s.granted) return { text: `철회 (${how})`, cls: "text-ink-muted" };
  if (s.valid) return { text: `동의 (${how})`, cls: "text-[#1B6B3A]" };
  if (s.needs_recheck) return { text: `재확인 필요 (${how}) · 발송 제외`, cls: "text-[#B4560A]" };
  if (s.subject === "guardian") return { text: `보호자 확인 필요 (${how}) · 보호자 동의 링크로 다시 받으세요`, cls: "text-[#B4560A]" };
  if (s.subject === "self") return { text: `본인 동의 무효 (14세 미만, ${how}) · 보호자 동의 필요`, cls: "text-[#B4560A]" };
  return { text: `직원 기록 (${when}) · 손님이 직접 동의해야 유효`, cls: "text-[#B4560A]" };
}

type Contact = { id: string; channel: ContactChannel; memo: string | null; created_at: string; profiles: { name: string } | null };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Customers({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const selectedId = one(sp.id);
  const isNew = one(sp.new) === "1";
  const today = todayKst(await requestTime());

  const supabase = await createClient();
  let list = supabase
    .from("customers")
    .select("id, name, phone, level, tags, next_contact_on, merge_candidate_id")
    .eq("shop_id", shop.id)
    .is("anonymized_at", null)
    .order("name")
    .limit(200);
  if (q) {
    // 이름·연락처는 부분 일치, 태그는 정확히
    const safe = q.replace(/[%,()]/g, "");
    list = list.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,tags.cs.{${safe.replace(/^#/, "")}}`);
  }
  const [{ data: rows }, { data: dueRows }, { count: total }, { data: recipients }] = await Promise.all([
    list,
    supabase.from("customers").select("id, name").eq("shop_id", shop.id).is("anonymized_at", null).lte("next_contact_on", today).order("next_contact_on"),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).is("anonymized_at", null),
    supabase.rpc("marketing_recipients", { p_shop_id: shop.id }),
  ]);
  const customers = (rows ?? []) as (Pick<Customer, "id" | "name" | "phone" | "level" | "tags" | "next_contact_on"> & { merge_candidate_id: string | null })[];
  const toConfirm = customers.filter((c) => c.merge_candidate_id).length;
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
        <div className="flex flex-wrap gap-x-4">
          <Link href="/shop/register-qr" className="flex min-h-11 items-center text-sm text-brand underline">
            손님 셀프 등록 QR
          </Link>
          <Link href="/shop/privacy-notice" className="flex min-h-11 items-center text-sm text-brand underline">
            개인정보 고지 문구
          </Link>
        </div>
        {toConfirm > 0 && (
          <p className="rounded-lg bg-[#FFF1E0] p-3 text-xs text-[#7A3E06]">
            <strong>셀프 등록 확인 필요 {toConfirm}명</strong> · 같은 연락처 손님이 있습니다. 카드에서 합치거나 따로 두세요.
          </p>
        )}
        <p className="text-xs text-ink-muted">
          광고 수신 가능 {(recipients ?? []).length}명 · 손님이 직접 동의했고 2년이 지나지 않은 경우만
        </p>
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
                    {c.merge_candidate_id && <span className="ml-1 rounded-full bg-[#FFF1E0] px-1.5 py-0.5 text-[10px] font-medium text-[#B4560A]">확인 필요</span>}
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
  const [{ data: c }, { data: hist }, { data: links }, { data: contactRows }, { data: consentRows }, { data: healthData }] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, name, phone, guardian_name, guardian_phone, level, equipment_size, tags, memo, next_contact_on, next_contact_note, birth_year, source, merge_candidate_id, anonymized_at, owner:profiles!customers_owner_user_id_fkey(name)",
      )
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle(),
    supabase
      .from("job_customers")
      .select("jobs(id, starts_at, ends_at, status, lesson_type, sports(name), resorts(name), job_prices(customer_price), assignments(lesson_note, instructors(profiles(name))))")
      .eq("customer_id", id),
    supabase.from("customer_links").select("customer_id, linked_customer_id").or(`customer_id.eq.${id},linked_customer_id.eq.${id}`),
    supabase.from("customer_contacts").select("id, channel, memo, created_at, profiles(name)").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("customer_consent_state").select("kind, granted, subject, method, created_at, valid, needs_recheck").eq("customer_id", id),
    supabase.from("health_warnings").select("terms, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(5),
  ]);
  const healthRows = (healthData ?? []) as { terms: string[]; created_at: string }[];
  const consents = new Map(((consentRows ?? []) as ConsentState[]).map((r) => [r.kind, r]));
  const contacts = (contactRows ?? []) as unknown as Contact[];
  if (!c) return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">손님을 찾을 수 없습니다.</p>;
  const cust = c as unknown as Customer;
  if (cust.anonymized_at) {
    return (
      <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">
        {new Date(Date.parse(cust.anonymized_at) + 9 * 3600_000).toISOString().slice(0, 10)}에 익명화된 손님입니다. 이름·연락처·메모는 지워졌고 통계용 강습 이력만 남아 있습니다.
      </p>
    );
  }
  // 연락처가 보이는 손님 카드 열람을 기록한다
  await logAccess("customer_view", shopId, cust.id);
  const aiSummary = await isAiEnabled(shopId, "customer_summary");
  const minor = isMinor(cust.birth_year, kstYear(await requestTime()));
  const { data: candidate } = cust.merge_candidate_id
    ? await supabase.from("customers").select("id, name, phone, level").eq("id", cust.merge_candidate_id).eq("shop_id", shopId).maybeSingle()
    : { data: null };
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
      {candidate && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">
          <p>
            <strong>셀프 등록 · 확인 필요</strong> · 같은 연락처의 기존 손님 <strong>{candidate.name}</strong>
            {candidate.level ? ` (${candidate.level})` : ""}이(가) 있습니다. 같은 사람이면 기존 카드로 합치세요. 합치면 되돌릴 수 없습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={mergeCustomer}>
              <input type="hidden" name="keep" value={candidate.id} />
              <input type="hidden" name="dup" value={cust.id} />
              <button className="min-h-11 rounded-[10px] bg-brand px-4 font-medium text-white">기존 카드로 합치기</button>
            </form>
            <form action={dismissMerge}>
              <input type="hidden" name="id" value={cust.id} />
              <button className="min-h-11 rounded-[10px] border border-[#D9A46A] bg-white px-4">다른 사람 · 따로 두기</button>
            </form>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-line bg-white p-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#E3EBFF] text-2xl font-bold text-brand">{cust.name.slice(0, 1)}</span>
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{cust.name}</h2>
            {cust.source === "self" && <span className="rounded-full bg-[#EEF1F6] px-2 py-0.5 text-[11px] font-medium text-ink-muted">셀프 등록</span>}
            {minor && <span className="rounded-full bg-[#FFF1E0] px-2 py-0.5 text-[11px] font-medium text-[#B4560A]">14세 미만 · 보호자 동의</span>}
            {cust.tags.map((t) => (
              <span key={t} className="rounded-full bg-[#E3EBFF] px-2 py-0.5 text-[11px] font-medium text-brand">
                #{t}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {[cust.birth_year && `${cust.birth_year}년생`, cust.level, cust.phone, cust.guardian_name && `보호자 ${cust.guardian_name} ${cust.guardian_phone ?? ""}`]
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

      {aiSummary && <SummaryBox key={cust.id} id={cust.id} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Box label="현재 레벨" value={cust.level ?? "—"} />
        <Box label="장비 사이즈" value={cust.equipment_size ?? "—"} />
        <Box
          label="다음 연락"
          value={cust.next_contact_on ? formatDay(cust.next_contact_on) : "—"}
          sub={cust.next_contact_on ? [cust.next_contact_note, cust.owner?.name && `담당 ${cust.owner.name}`].filter(Boolean).join(" · ") : undefined}
          warn={!!cust.next_contact_on}
        />
      </div>

      <div className="rounded-[14px] border border-line bg-white p-5">
        <h3 className="text-base font-bold">선택 동의</h3>
        <p className="mt-1 text-xs text-ink-muted">손님(14세 미만은 보호자)이 링크·QR에서 직접 한 동의만 유효합니다. 직원이 남긴 기록은 참고용이고, 철회는 바로 반영됩니다.</p>
        <ul className="mt-2">
          {(Object.keys(OPTIONAL_CONSENTS) as OptionalConsentKind[]).map((k) => {
            const st = consents.get(k);
            const l = consentLabel(st);
            return (
              <li key={k} className="flex flex-wrap items-center gap-2 border-t border-[#EEF1F6] py-2.5 text-sm first:border-t-0">
                <span className="min-w-40 flex-1">{OPTIONAL_CONSENTS[k].label.replace(" (선택)", "")}</span>
                <span className={`text-xs ${l.cls}`}>{l.text}</span>
                <form action={recordStaffConsent}>
                  <input type="hidden" name="id" value={cust.id} />
                  <input type="hidden" name="kind" value={k} />
                  <input type="hidden" name="granted" value={st?.granted ? "false" : "true"} />
                  <button className="min-h-11 px-2 text-xs text-ink-muted underline">{st?.granted ? "철회 기록" : "직원 기록 남기기"}</button>
                </form>
              </li>
            );
          })}
        </ul>
        <ConsentLink id={cust.id} minor={minor} />
      </div>
      {healthRows.length > 0 && (
        <p role="alert" className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">
          메모에 건강 정보로 보이는 단어가 있었습니다 ({[...new Set(healthRows.flatMap((h) => h.terms))].join(", ")}). 건강 정보는 받지 않는 것이 원칙입니다. 꼭 필요한 내용이 아니면 샵 메모에서 지워 주세요.
        </p>
      )}
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

      <div className="rounded-[14px] border border-line bg-white p-5">
        <h3 className="text-base font-bold">연락 기록</h3>
        <div className="mt-3">
          <ContactForm id={cust.id} nextOn={cust.next_contact_on} nextNote={cust.next_contact_note} />
        </div>
        {contacts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">아직 연락 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3">
            {contacts.map((k) => (
              <li key={k.id} className="flex items-start gap-3 border-t border-[#EEF1F6] py-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-ink-muted">
                  {formatDay(new Date(Date.parse(k.created_at) + 9 * 3600_000).toISOString().slice(0, 10))} · {CONTACT_CHANNELS[k.channel]}
                </span>
                <span className="min-w-0 flex-1">
                  {k.memo ?? "—"}
                  {k.profiles?.name && <span className="text-xs text-ink-muted"> · {k.profiles.name}</span>}
                </span>
                <form action={deleteContact}>
                  <input type="hidden" name="contact_id" value={k.id} />
                  <button aria-label="이 연락 기록 지우기" className="min-h-11 min-w-11 text-ink-muted">
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EraseForm id={cust.id} name={cust.name} />

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

function Box({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-base font-bold ${warn ? "text-[#B4560A]" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}
