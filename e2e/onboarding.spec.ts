import { expect, test } from "@playwright/test";
import { admin, as, login, PASSWORD } from "./helpers";

// P16-4 시범 샵 온보딩: 첫 로그인 체크리스트(자동 체크·닫기·다시 열기), 손님·강사 CSV 일괄 등록
const file = (name: string, text: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from("﻿" + text, "utf8") });

test("새 샵: 체크리스트 → 샵 정보 입력으로 자동 체크 → 닫고 다시 열기 → 손님 CSV 등록", async ({ page }) => {
  const email = `onboard-${Date.now()}@winter.test`;
  await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role: "shop_admin", name: "[테스트] 새사장", agreed: true } });
  await login(page, email);
  await page.waitForURL(/\/shop\/new/);
  await page.getByText("렌탈샵", { exact: true }).click();
  await page.getByLabel("샵 이름").fill("[테스트] 온보딩 렌탈");
  await page.getByText("하이원", { exact: true }).click();
  await page.getByRole("button", { name: "등록하기" }).click();
  await page.waitForURL((u) => u.pathname === "/shop");

  const card = page.getByRole("region", { name: "겨울파트너 시작하기" });
  await expect(card).toContainText("1/5 완료 · 다음: 샵 정보"); // 영업 스키장은 등록 때 골랐다
  await expect(card.getByRole("listitem").filter({ hasText: "영업 스키장" })).toContainText("(완료)");

  await card.getByRole("link", { name: "샵 정보 입력" }).click();
  await page.getByRole("textbox", { name: /사업자등록번호/ }).fill("0000077701");
  await page.getByRole("textbox", { name: /대표자/ }).fill("[테스트] 새사장");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "저장했습니다." })).toBeVisible();
  await page.goto("/shop");
  await expect(card).toContainText("2/5 완료 · 다음: 강사 등록");

  await card.getByRole("button", { name: "닫기" }).click();
  await expect(card).toBeHidden();
  await page.getByRole("button", { name: "시작 안내 다시 보기 (2/5)" }).click();
  await expect(card).toBeVisible();

  // 손님 CSV: 정상 2, 연락처 오류 1, 파일 안 중복 1, 건강 정보 메모 1
  await page.goto("/shop/import?type=customers");
  const res = await page.request.get("/shop/import/template?type=customers");
  expect(await res.text()).toContain("이름,휴대폰,출생연도");
  await page.getByLabel("CSV 파일").setInputFiles(
    file(
      "손님.csv",
      [
        "이름,휴대폰,레벨,메모",
        "[테스트] 가손님,010-0000-7001,초급,",
        "[테스트] 나손님,01000007002,중급,오전 선호",
        "[테스트] 다손님,1234,,",
        "[테스트] 라손님,010-0000-7001,,",
        "[테스트] 마손님,010-0000-7005,,허리 디스크",
      ].join("\r\n"),
    ),
  );
  await page.getByRole("button", { name: /미리 보기/ }).click();
  await expect(page.getByText("모두 5행 · 등록 2 · 건너뜀 1 · 오류 2")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "다손님" })).toContainText("연락처 형식");
  await expect(page.getByRole("row").filter({ hasText: "라손님" })).toContainText("2행과 같은 연락처");
  await expect(page.getByRole("row").filter({ hasText: "마손님" })).toContainText("건강 정보");

  await page.getByRole("button", { name: "손님 2명 등록" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "안내했는지 확인" })).toBeVisible();
  await page.getByLabel(/개인정보 수집·이용/).check();
  await page.getByRole("button", { name: "손님 2명 등록" }).click();
  await expect(page.getByRole("status")).toContainText("손님 2명을 등록했습니다. (3행은 건너뜀)");

  const { data } = await admin().from("customers").select("name, phone, shops!inner(name)").eq("shops.name", "[테스트] 온보딩 렌탈").order("name");
  expect(data?.map((c) => [c.name, c.phone])).toEqual([
    ["[테스트] 가손님", "010-0000-7001"],
    ["[테스트] 나손님", "010-0000-7002"],
  ]);
});

test("강사 CSV: 가입한 강사에게 전속 초대, 남의 전속·미가입·오류는 건너뛴다", async ({ browser }) => {
  const shop = await as(browser, "shop2@winter.test");
  await shop.goto("/shop/import?type=instructors");
  await shop.getByLabel("CSV 파일").setInputFiles(
    file("강사.csv", ["이름,휴대폰,이메일", "김스키,,KIM@winter.test", "오전속,010-0000-0024,", "[테스트] 미가입,010-0000-7999,", "[테스트] 오류,12,"].join("\n")),
  );
  await shop.getByRole("button", { name: /미리 보기/ }).click();
  await expect(shop.getByText("모두 4행 · 등록 1 · 건너뜀 2 · 오류 1")).toBeVisible();
  await expect(shop.getByRole("row").filter({ hasText: "오전속" })).toContainText("다른 샵 전속");
  await expect(shop.getByRole("row").filter({ hasText: "미가입" })).toContainText("아직 가입하지 않았습니다");
  await shop.getByRole("button", { name: "강사 1명에게 전속 초대 보내기" }).click();
  await expect(shop.getByRole("status")).toContainText("강사 1명에게 전속 초대를 보냈습니다.");
  await expect(shop.getByRole("status")).toContainText("[테스트] 미가입");

  const db = admin();
  const { data } = await db.from("exclusive_invites").select("id, status").eq("shop_id", "b0000000-0000-0000-0000-000000000002").eq("instructor_id", "c0000000-0000-0000-0000-000000000021");
  expect(data?.map((d) => d.status)).toEqual(["pending"]);
  await db.from("exclusive_invites").update({ status: "canceled" }).eq("id", data![0].id); // 다른 시나리오에 영향 없게
});
