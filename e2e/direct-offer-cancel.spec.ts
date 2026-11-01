import { expect, test } from "@playwright/test";
import { PARK, addAvailability, admin, as, createJob, dayLabel, kstDate } from "./helpers";

// 직접 의뢰 → 강사 수락 → 손님 취소 / 강사 일방 취소(패널티)
test.describe.configure({ mode: "serial" });

async function offerAndAccept(browser: import("@playwright/test").Browser, date: string, note: string) {
  await addAvailability(PARK, date);
  const shop = await as(browser, "shop1@winter.test");
  const jobId = await createJob(shop, { date, customer: `${note} 손님`, phone: "010-0000-3001", rate: 70000, note });
  const cand = shop.getByRole("listitem").filter({ hasText: "박스키" });
  await cand.getByRole("button", { name: "의뢰 보내기" }).click();
  await expect(shop.getByRole("heading", { name: "의뢰 기록" })).toBeVisible();
  await expect(shop.getByText("응답 대기", { exact: true })).toBeVisible();

  const park = await as(browser, "park@winter.test");
  await park.goto("/instructor");
  const offer = park.locator("section").filter({ hasText: note }).filter({ has: park.getByRole("button", { name: "수락" }) });
  await expect(offer).not.toContainText("010-0000-3001"); // 강사는 연락처를 못 본다
  await offer.getByRole("button", { name: "수락" }).click();
  await expect(park.getByRole("status")).toContainText("의뢰를 수락했습니다");
  await shop.reload();
  await expect(shop.getByText("배정: 박스키")).toBeVisible();
  return { shop, park, jobId };
}

test("직접 의뢰 수락 뒤 손님 취소: 강습 취소, 강사에게 알림, 정산 제외", async ({ browser }) => {
  const { shop, park, jobId } = await offerAndAccept(browser, kstDate(25), "E2E 손님취소");

  await shop.getByRole("button", { name: "강습 취소…" }).click();
  await shop.getByLabel("손님 취소").check();
  await shop.getByPlaceholder("사유 (선택)").fill("손님 일정 변경");
  await shop.getByRole("button", { name: "강습 취소", exact: true }).click();
  await expect(shop.getByText("취소", { exact: true })).toBeVisible(); // 상태 표시
  await expect(shop.getByRole("button", { name: "강습 취소…" })).toHaveCount(0);

  const db = admin();
  const { data: job } = await db.from("jobs").select("status").eq("id", jobId).single();
  expect(job!.status).toBe("canceled");
  const { data: notes } = await db.from("notifications").select("kind, payload").eq("kind", "job_canceled").contains("payload", { job_id: jobId });
  expect(notes!.length).toBeGreaterThan(0);

  await park.goto("/notifications");
  await expect(park.getByText(/취소/).first()).toBeVisible();
});

test("강사 일방 취소: 배정 해제, 패널티 기록", async ({ browser }) => {
  const date = kstDate(26);
  const { shop, park, jobId } = await offerAndAccept(browser, date, "E2E 강사취소");

  await park.goto(`/instructor/schedule?week=${date}`);
  const lesson = park.getByRole("listitem").filter({ hasText: dayLabel(date) });
  await lesson.getByRole("button", { name: "이 강습 취소" }).click();
  await expect(lesson).toContainText("패널티 1점");
  await lesson.getByPlaceholder("사유").fill("부상");
  await lesson.getByRole("button", { name: "취소 확정" }).click();
  await expect(park.getByRole("status")).toContainText("취소했습니다. 패널티 1점이 기록됐습니다.");
  await expect(park.getByText("이번 주 확정 강습").locator("..")).toContainText("없습니다.");

  const db = admin();
  const { data: a } = await db.from("assignments").select("id").eq("job_id", jobId);
  expect(a).toEqual([]);
  const { data: p } = await db.from("instructor_penalties").select("points").eq("instructor_id", PARK).eq("job_id", jobId);
  expect(p).toEqual([{ points: 1 }]);

  await shop.reload();
  await expect(shop.getByText("배정: 박스키")).toHaveCount(0);
});
