// AI_MOCK=1용 접수 추출기 (규칙 기반). 실제 모델이 아니라 E2E·로컬에서 화면 흐름을 확인하는 용도.
export function mockExtractIntake(system: string, text: string) {
  const today = system.match(/오늘은 (\d{4})-(\d{2})-(\d{2})/);
  const year = today ? Number(today[1]) : new Date().getFullYear();
  const md = text.match(/(\d{1,2})\s*(?:\/|월)\s*(\d{1,2})/);
  let date: string | null = null;
  if (md) {
    const m = Number(md[1]);
    const y = today && m < Number(today[2]) ? year + 1 : year;
    date = `${y}-${String(m).padStart(2, "0")}-${String(Number(md[2])).padStart(2, "0")}`;
  }
  const t = text.match(/(오전|오후|저녁|아침)?\s*(\d{1,2})\s*(?:시|:00)(\s*반)?/);
  let start: string | null = null;
  if (t) {
    let h = Number(t[2]);
    if ((t[1] === "오후" || t[1] === "저녁" || (!t[1] && h <= 7)) && h < 12) h += 12;
    start = `${String(h).padStart(2, "0")}:${t[3] ? "30" : "00"}`;
  }
  const n = text.match(/(\d+)\s*명/);
  const lesson = /1\s*:\s*1|개인/.test(text) ? "private" : /1\s*:\s*2/.test(text) ? "semi" : n && Number(n[1]) >= 3 ? "group" : null;
  const sport = /보드/.test(text) ? "스노보드" : /스키/.test(text) ? "스키" : null;
  const level = (text.match(/처음|입문|초급|중급|상급/) ?? [null])[0];
  return {
    date,
    start,
    end: null,
    sport,
    lesson_type: lesson,
    student_count: n ? Number(n[1]) : null,
    level,
    note: null,
    patch_paid_by: /패치는?\s*샵/.test(text) ? "shop" : null,
    customer_name: null,
    uncertain: date ? [] : ["date"],
  };
}
