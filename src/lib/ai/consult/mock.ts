// AI_MOCK=1·단위 테스트용 가짜 상담 모델. 실제 API를 부르지 않고 키워드로 의도를 고르고, system의 안내 정보 줄을 그대로 돌려준다.
// 테스트 갈래: 손님 글에 "[가짜:금액틀림]"이 있으면 안내 정보에 없는 금액(99,000원)을, "[가짜:낮은확신]"이면 신뢰도 0.5를 돌려준다.
const ORDER: [string, RegExp][] = [
  ["complaint", /불만|화가|화나|최악|실망|항의|환불해\s*주|어이없|짜증/],
  ["negotiation", /깎|할인|싸게|네고|에누리|더\s*저렴/],
  // 규정을 묻는 질문은 정책(안내 정보), 바꿔 달라는 요청은 예약(사람)
  ["policy", /규정|정책|(취소|환불|변경|연기)\S*\s*(방법|어떻게)/],
  ["booking", /예약|자리\s*(있|남)|가능할까|가능한가요|가능해요|잡아\s*주|변경하고|바꾸고/],
  ["price", /얼마|가격|비용|요금|강습료|대여료|렌탈비/],
  ["hours", /몇\s*시|영업|오픈|문\s*(열|닫)|마감|휴무/],
  ["location", /어디|위치|주소|찾아가|오시는\s*길/],
  ["faq", /준비물|복장|어린이|아이|단체|주차/],
  ["smalltalk", /^(안녕|감사|고마|ㅎㅇ)/],
];

export function mockConsult(content: string, system: string) {
  const q = (content.match(/"""\n([\s\S]*)\n"""/)?.[1] ?? content).trim();
  const kbLine = (kind: string) => system.split("\n").find((l) => l.startsWith("- [") && l.includes(`(${kind})`));
  if (q.includes("[가짜:금액틀림]")) return { intent: "price", confidence: 0.95, reply: "강습료는 1:1 2시간 99,000원입니다.", used_kb: [] };
  const intent = ORDER.find(([, r]) => r.test(q))?.[0] ?? "unknown";
  const people = Number(q.match(/(\d+)\s*명/)?.[1] ?? 0) || undefined;
  const date = q.match(/(\d{1,2})월\s*(\d{1,2})일/)?.[0];
  if (["price", "hours", "location", "policy", "faq"].includes(intent)) {
    const line = kbLine(intent);
    if (!line) return { intent: "unknown", confidence: 0.4, reply: "", draft: "[초안] 안내 정보에 없는 질문입니다. 확인 후 답드릴게요." };
    const [, id, rest] = line.match(/^- \[([^\]]+)\] \([a-z_]+\) (.*)$/) ?? [];
    return { intent, confidence: q.includes("[가짜:낮은확신]") ? 0.5 : 0.92, reply: `안내드려요. ${rest}`, used_kb: id ? [id] : [] };
  }
  if (intent === "smalltalk") return { intent, confidence: 0.9, reply: "안녕하세요! 무엇을 도와드릴까요?" };
  return {
    intent,
    confidence: 0.8,
    reply: "",
    draft: "[초안] 문의 주셔서 감사합니다. 확인 후 바로 연락드리겠습니다.",
    extracted: { ...(people ? { people } : {}), ...(date ? { date } : {}) },
  };
}
