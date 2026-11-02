// P18-2 동시성과 반복 클릭: 같은 요청을 동시에 보내도 한 번만 처리된다 (화면 없이 각 계정 권한으로 RPC를 동시에 부른다)
import { expect, test } from "@playwright/test";
import { KIM, SHOP1, admin, userClient } from "./helpers";

const SHOP2 = "b0000000-0000-0000-0000-000000000002";
const db = admin();
const ids = async (table: string, name: string) => (await db.from(table).select("id").eq("name", name).single()).data!.id as number;

async function job(shopId: string, resort: string, starts: Date, extra: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from("jobs")
    .insert({
      shop_id: shopId, resort_id: await ids("resorts", resort), sport_id: await ids("sports", "스키"),
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 2 * 3600_000).toISOString(),
      lesson_type: "private", student_count: 1, instructor_rate: 80000, status: "draft", assign_mode: "direct", note: "P18 동시성", ...extra,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

test.afterAll(async () => {
  await db.from("jobs").delete().eq("note", "P18 동시성");
});

test("두 샵이 같은 시간에 같은 강사에게 의뢰하고, 강사가 둘 다 동시에 수락해도 하나만 배정된다", async () => {
  const at = new Date(Date.now() + 40 * 86400_000);
  const [j1, j2] = [await job(SHOP1, "하이원", at), await job(SHOP2, "용평", at)];
  const [s1, s2, kim] = await Promise.all([userClient("shop1@winter.test"), userClient("shop2@winter.test"), userClient("kim@winter.test")]);
  const o1 = await s1.rpc("send_job_offer", { p_job_id: j1, p_instructor_id: KIM });
  const o2 = await s2.rpc("send_job_offer", { p_job_id: j2, p_instructor_id: KIM });
  expect(o1.error ?? o2.error).toBeNull();
  const results = await Promise.all([
    kim.rpc("respond_job_offer", { p_offer_id: o1.data, p_accept: true }),
    kim.rpc("respond_job_offer", { p_offer_id: o2.data, p_accept: true }),
  ]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  const { count } = await db.from("assignments").select("*", { count: "exact", head: true }).in("job_id", [j1, j2]).eq("instructor_id", KIM);
  expect(count).toBe(1);
});

test("같은 의뢰를 두 번 동시에 수락해도 배정은 하나", async () => {
  const j = await job(SHOP1, "하이원", new Date(Date.now() + 41 * 86400_000));
  const [s1, kim] = await Promise.all([userClient("shop1@winter.test"), userClient("kim@winter.test")]);
  const { data: offer } = await s1.rpc("send_job_offer", { p_job_id: j, p_instructor_id: KIM });
  await Promise.all([1, 2, 3].map(() => kim.rpc("respond_job_offer", { p_offer_id: offer, p_accept: true })));
  const { count } = await db.from("assignments").select("*", { count: "exact", head: true }).eq("job_id", j);
  expect(count).toBe(1);
});

test("두 사람이 같은 공고의 서로 다른 입찰을 동시에 선정해도 배정은 하나", async () => {
  const j = await job(SHOP1, "하이원", new Date(Date.now() + 42 * 86400_000), {
    status: "open", assign_mode: "bid", bid_closes_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
  const b = await db.from("bids").insert([
    { job_id: j, bidder_type: "instructor", instructor_id: KIM, amount: 70000 },
    { job_id: j, bidder_type: "instructor", instructor_id: "c0000000-0000-0000-0000-000000000023", amount: 75000 },
  ]).select("id");
  const [a, c] = await Promise.all([userClient("shop1@winter.test"), userClient("shop1@winter.test")]);
  const r = await Promise.all([
    a.rpc("select_bid", { p_bid_id: b.data![0].id, p_final_rate: 70000 }),
    c.rpc("select_bid", { p_bid_id: b.data![1].id, p_final_rate: 75000 }),
  ]);
  expect(r.filter((x) => !x.error)).toHaveLength(1);
  const { count } = await db.from("assignments").select("*", { count: "exact", head: true }).eq("job_id", j);
  expect(count).toBe(1);
  const { data: selected } = await db.from("bids").select("id").eq("job_id", j).eq("status", "selected");
  expect(selected).toHaveLength(1);
});

test("정산서 발행·지급 완료를 동시에 여러 번 눌러도 한 번만 처리되고 알림도 한 번", async () => {
  const month = "2027-03-01";
  const j = await job(SHOP1, "하이원", new Date("2027-03-10T01:00:00Z"), { status: "approved" });
  await db.from("assignments").insert({ job_id: j, instructor_id: KIM, final_rate: 80000, completed_at: new Date().toISOString(), approved_at: new Date().toISOString() });
  const s1 = await userClient("shop1@winter.test");
  await s1.rpc("generate_settlements", { p_shop_id: SHOP1, p_month: month });
  const issued = await Promise.all([1, 2, 3].map(() => s1.rpc("issue_settlements", { p_shop_id: SHOP1, p_month: month })));
  expect(issued.reduce((n, r) => n + ((r.data as number) ?? 0), 0)).toBe(1);
  const { data: st } = await db.from("settlements").select("id").eq("shop_id", SHOP1).eq("month", month).single();
  const before = (await db.from("notifications").select("*", { count: "exact", head: true }).eq("kind", "settlement_paid")).count ?? 0;
  await Promise.all([1, 2, 3].map(() => s1.rpc("set_settlement_paid", { p_settlement_id: st!.id, p_paid: true })));
  const after = (await db.from("notifications").select("*", { count: "exact", head: true }).eq("kind", "settlement_paid")).count ?? 0;
  expect(after - before).toBeLessThanOrEqual(1);
  const { data: final } = await db.from("settlements").select("status").eq("id", st!.id).single();
  expect(final!.status).toBe("paid");
  await db.from("settlements").delete().eq("id", st!.id);
});
