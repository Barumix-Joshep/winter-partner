// 운영 사이트 읽기 전용 점검 (P12-4). GET만 보내고 로그인·데이터 생성은 하지 않는다.
//   npm run check:prod                 → https://winter-partner.vercel.app
//   npm run check:prod -- https://…    → 다른 주소
const base = (process.argv[2] ?? "https://winter-partner.vercel.app").replace(/\/$/, "");
const results = [];

async function get(path, init) {
  const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "winter-partner-check" }, ...init });
  return { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() };
}

async function check(name, fn) {
  try {
    const msg = await fn();
    results.push({ ok: true, name, msg });
  } catch (e) {
    results.push({ ok: false, name, msg: e instanceof Error ? e.message : String(e) });
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

for (const path of ["/", "/login", "/terms", "/privacy", "/offline"]) {
  await check(`${path} 200`, async () => {
    const r = await get(path);
    expect(r.status === 200, `상태 ${r.status}`);
    expect(r.type.includes("text/html"), `content-type ${r.type}`);
    return "ok";
  });
}

await check("로그인 화면", async () => {
  const r = await get("/login");
  expect(/<title>겨울파트너/.test(r.body), "제목 없음");
  expect(!/Application error|Internal Server Error/.test(r.body), "오류 화면");
  return "제목 확인";
});

await check("약관·개인정보 처리방침 본문", async () => {
  const [t, p] = await Promise.all([get("/terms"), get("/privacy")]);
  expect(t.body.includes("이용약관"), "약관 본문 없음");
  expect(p.body.includes("개인정보"), "처리방침 본문 없음");
  return "ok";
});

await check("PWA manifest", async () => {
  const r = await get("/manifest.webmanifest");
  expect(r.status === 200, `상태 ${r.status}`);
  const m = JSON.parse(r.body);
  expect(m.name === "겨울파트너" && m.display === "standalone" && m.start_url === "/", "이름·표시 방식·시작 주소");
  const sizes = (m.icons ?? []).map((i) => i.sizes);
  expect(sizes.includes("192x192") && sizes.includes("512x512"), `아이콘 ${sizes.join(",")}`);
  for (const icon of m.icons) {
    const i = await fetch(new URL(icon.src, base + "/"), { method: "HEAD" });
    expect(i.ok, `아이콘 ${icon.src} ${i.status}`);
  }
  return `아이콘 ${m.icons.length}개`;
});

await check("서비스 워커", async () => {
  const r = await get("/sw.js");
  expect(r.status === 200 && r.type.includes("javascript"), `상태 ${r.status} ${r.type}`);
  return "ok";
});

for (const cron of ["/api/notify/dispatch", "/api/maintenance/daily"]) {
  await check(`크론 ${cron} 비밀값 없이 401`, async () => {
    const [none, wrong] = await Promise.all([get(cron), get(cron, { headers: { authorization: "Bearer wrong" } })]);
    expect(none.status === 401 && wrong.status === 401, `상태 ${none.status}/${wrong.status}`);
    return "ok";
  });
}

// 로그인 없이 보호된 화면: 로그인으로 보내고 데이터는 없다 (스트리밍이라 상태는 200, 본문 안에서 이동)
for (const path of ["/shop", "/shop/customers", "/shop/jobs/new", "/instructor", "/admin"]) {
  await check(`${path} 로그인 필요`, async () => {
    const r = await get(path);
    const toLogin = (r.status >= 300 && r.status < 400) || /NEXT_REDIRECT;[a-z]+;\/login/.test(r.body);
    expect(toLogin, `로그인으로 보내지 않음 (상태 ${r.status})`);
    expect(!/010-\d{4}-\d{4}/.test(r.body), "연락처 형식 문자열이 보임");
    return "로그인으로 이동";
  });
}

await check("정산서 PDF는 로그인 필요", async () => {
  const r = await get("/settlements/00000000-0000-0000-0000-000000000000/pdf");
  expect(r.status === 401, `상태 ${r.status}`);
  return "401";
});

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name} — ${r.msg}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${base}: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
