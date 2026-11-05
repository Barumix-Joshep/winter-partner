// 상담 엔진 2단계: 안내 정보 검색. 켜 둔 항목은 모두 프롬프트에 넣되(샵당 8000자 상한) 질문과 가까운 것부터 둔다.
import type { KbEntry } from "./types";

const KIND_HINTS: Record<string, RegExp> = {
  price: /얼마|가격|비용|요금|금액|원\b|강습료|대여료|렌탈비|price|cost/i,
  hours: /몇\s*시|시간|영업|오픈|문\s*(열|닫)|마감|휴무|언제|hours|open/i,
  location: /어디|위치|주소|찾아|오시는|길|주차|셔틀|where|location/i,
  policy: /취소|환불|변경|연기|노쇼|보험|규정|정책|cancel|refund/i,
  faq: /준비물|복장|어린이|아이|단체|나이|주차|faq/i,
};

const tokens = (t: string) => new Set((t.toLowerCase().match(/[가-힣]{2,}|[a-z0-9]{2,}/g) ?? []).flatMap((w) => (w.length > 2 && /[가-힣]/.test(w) ? [w, w.slice(0, 2)] : [w])));

export function rankKnowledge(question: string, items: KbEntry[]): KbEntry[] {
  const q = tokens(question);
  const score = (i: KbEntry) => {
    let s = 0;
    for (const w of tokens(`${i.title} ${i.content}`)) if (q.has(w)) s += 1;
    if (KIND_HINTS[i.kind]?.test(question)) s += 3;
    return s;
  };
  return items.map((i, n) => ({ i, s: score(i), n })).sort((a, b) => b.s - a.s || a.n - b.n).map((x) => x.i);
}
