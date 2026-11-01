import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { parseSearch, SLOTS } from "@/lib/shop/search";
import { proposeExclusive } from "../team/actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function InstructorsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">강사 찾기</h1>
        <p className="mt-1 text-sm text-ink-muted">
          내 영업 스키장에서 강습 가능한 강사만 보입니다. 다른 샵 전속 강사는 보이지 않고, 연락처는 공개되지 않습니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Search searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Row = {
  instructor_id: string;
  name: string;
  level: string | null;
  base_rate: number | null;
  sports: string[];
  resorts: string[];
  certs: string[];
  is_mine: boolean;
  rating: number | null;
  lesson_count: number;
};

const select = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm";

async function Search({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");

  const q = parseSearch(await searchParams, shop.resorts.map((r) => r.id));
  const supabase = await createClient();
  const [{ data: sports }, { data: invites }, { data, error }] = await Promise.all([
    supabase.from("sports").select("id, name").order("id"),
    supabase.from("exclusive_invites").select("instructor_id").eq("shop_id", shop.id).eq("status", "pending"),
    q.resortId
      ? supabase.rpc("search_instructors", {
          p_shop_id: shop.id,
          p_resort_id: q.resortId,
          p_sport_id: q.sportId,
          p_from: q.range?.from ?? null,
          p_to: q.range?.to ?? null,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const rows = (data ?? []) as Row[];
  const mine = rows.filter((r) => r.is_mine).length;
  const invited = new Set((invites ?? []).map((i) => i.instructor_id as string));
  const canInvite = shop.status === "approved";

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          스키장
          <select name="resort" defaultValue={q.resortId ?? ""} className={select}>
            {shop.resorts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          종목
          <select name="sport" defaultValue={q.sportId ?? ""} className={select}>
            <option value="">전체</option>
            {(sports ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          날짜 <span className="sr-only">(비우면 일정과 상관없이)</span>
          <input type="date" name="date" defaultValue={q.date} className={select} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          시간대
          <select name="slot" defaultValue={q.slot} className={select}>
            {Object.entries(SLOTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label} ({s.from}~{s.to})
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white">검색</button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span className="font-medium text-ink">{rows.length}명</span>
        {q.range ? `${q.date} ${SLOTS[q.slot].label} 강습 가능` : "날짜를 고르면 그 시간에 가능한 강사만 보입니다"}
        <span className="ml-auto flex gap-1.5">
          <span className="rounded-full bg-[#E3EBFF] px-2.5 py-1 font-medium text-brand">전속 {mine}</span>
          <span className="rounded-full bg-[#EEF1F6] px-2.5 py-1">프리랜서 {rows.length - mine}</span>
        </span>
      </div>

      {error && <p className="text-sm text-danger">검색하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      {!error && rows.length === 0 && (
        <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">조건에 맞는 강사가 없습니다.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.instructor_id} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-13 shrink-0 items-center justify-center rounded-full bg-[#E3EBFF] text-lg font-bold text-brand">
                {r.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5">
                  <span className="font-bold">{r.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      r.is_mine ? "bg-[#E3EBFF] text-brand" : "bg-[#EEF1F6] text-ink-muted"
                    }`}
                  >
                    {r.is_mine ? "전속" : "프리랜서"}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {r.sports.join(" · ")} · {r.certs.length ? r.certs.join(" · ") : "자격 확인 전"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[#35466A]">
              <span className="rounded-md bg-surface px-2 py-1">{r.rating ? `평점 ${r.rating}` : "평점 없음"}</span>
              <span className="rounded-md bg-surface px-2 py-1">강습 {r.lesson_count}회</span>
            </div>
            <p className="text-xs text-ink-muted">가능 스키장 · {r.resorts.join(" · ")}</p>
            {!r.is_mine && canInvite && (
              invited.has(r.instructor_id) ? (
                <p className="text-xs text-ink-muted">전속 제안을 보냈습니다</p>
              ) : (
                <form action={proposeExclusive}>
                  <input type="hidden" name="instructor_id" value={r.instructor_id} />
                  <button className="min-h-11 text-xs font-medium text-brand underline">전속 제안하기</button>
                </form>
              )
            )}
            <div className="mt-auto flex items-center justify-between border-t border-[#EEF1F6] pt-3">
              <div>
                <p className="text-[11px] text-ink-muted">2시간 기본 단가</p>
                <p className="text-[17px] font-bold">{r.base_rate ? `${r.base_rate.toLocaleString("ko-KR")}원` : "협의"}</p>
              </div>
              {/* 직접 의뢰는 P4-2에서 연결 */}
              <button
                disabled
                title="강습 등록 기능과 함께 열립니다"
                className="min-h-10 rounded-lg border-[1.5px] border-brand px-3.5 text-[13px] font-medium text-brand opacity-50"
              >
                직접 의뢰
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
