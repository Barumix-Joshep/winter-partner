import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildStatement, type SettlementRow } from "./statement";
import { renderStatementPdf } from "./pdf";
import { renderMonthXlsx } from "./xlsx";

const row: SettlementRow = {
  id: "s1",
  month: "2026-11-01",
  gross: 200000,
  withholding: 6600,
  net: 193400,
  status: "issued",
  pay_type: "business_3_3",
  shops: { name: "하이원 스노우렌탈", business_no: "000-00-00001" },
  instructors: { profiles: { name: "김스키" } },
  payee: null,
  settlement_items: [
    { amount: 120000, assignments: { jobs: { starts_at: "2026-11-01T04:00:00Z", ends_at: "2026-11-01T06:00:00Z", lesson_type: "semi", sports: { name: "스키" } } } },
    { amount: 80000, assignments: { jobs: { starts_at: "2026-11-01T01:00:00Z", ends_at: "2026-11-01T03:00:00Z", lesson_type: "private", sports: { name: "스키" } } } },
  ],
};

describe("buildStatement", () => {
  it("정산서 데이터 (항목은 시간순, 세금 나눠서)", () => {
    const s = buildStatement(row);
    expect(s.title).toBe("2026년 11월 강습료 정산서");
    expect(s.payee).toEqual({ name: "김스키", kind: "개인 강사" });
    expect(s.items.map((i) => i.when)).toEqual(["11/1(일) 10:00~12:00", "11/1(일) 13:00~15:00"]);
    expect(s.items[1].lesson).toBe("스키 1:2");
    expect(s.tax).toEqual({ incomeTax: 6000, localTax: 600, total: 6600 });
    expect(s.net).toBe(193400);
  });

  it("팀 지급", () => {
    const s = buildStatement({ ...row, instructors: null, payee: { name: "평창 라이딩스쿨" }, withholding: 0, net: 200000, pay_type: null });
    expect(s.payee).toEqual({ name: "평창 라이딩스쿨", kind: "강습팀" });
    expect(s.tax.total).toBe(0);
    expect(s.payType).toEqual({ code: "team", label: "사업자 지급 (원천세 없음)", byShop: false });
  });

  it("지급 방식 (P19-1): 3.3%는 그대로, 샵 별도 처리는 원천세 0과 안내", () => {
    expect(buildStatement(row).payType).toEqual({ code: "business_3_3", label: "사업소득 3.3%", byShop: false });
    const s = buildStatement({ ...row, withholding: 0, net: 200000, pay_type: "none_by_shop" });
    expect(s.payType).toEqual({ code: "none_by_shop", label: "원천징수 샵 별도 처리", byShop: true });
    expect(s.tax).toEqual({ incomeTax: 0, localTax: 0, total: 0 });
    expect(s.net).toBe(200000);
    expect(s.notes[0]).toBe("원천징수는 샵에서 별도 처리합니다. 이 정산서의 원천세는 0원입니다.");
  });

  it("저장 전 정산서(지급 방식 없음)는 3.3%로 본다", () => {
    expect(buildStatement({ ...row, pay_type: null }).payType.code).toBe("business_3_3");
  });
});

describe("renderStatementPdf", () => {
  it("한글 글꼴을 넣은 PDF 한 장", async () => {
    const bytes = await renderStatementPdf(buildStatement(row));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
    expect(bytes.length).toBeLessThan(4_000_000);
  });
});

describe("renderMonthXlsx", () => {
  it("전속 2명 중 1명만 샵 별도 처리: 요약 합계 = 정산서 합계 (P19-1)", async () => {
    const a = buildStatement(row);
    const b = buildStatement({ ...row, id: "s2", instructors: { profiles: { name: "박보드" } }, withholding: 0, net: 200000, pay_type: "none_by_shop" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderMonthXlsx("2026-11", "하이원 스노우렌탈", [a, b])) as unknown as ExcelJS.Buffer);
    const sum = wb.getWorksheet("정산 요약")!;
    expect(sum.getRow(3).values).toEqual([undefined, "박보드", "개인 강사", "원천징수 샵 별도 처리", 2, 200000, 0, 0, 0, 200000, "정산서 발행"]);
    const col = (c: number) => [2, 3].reduce((t, r) => t + Number(sum.getRow(r).getCell(c).value), 0);
    expect([col(5), col(8), col(9)]).toEqual([a.gross + b.gross, a.tax.total + b.tax.total, a.net + b.net]);
    expect(sum.getRow(5).values).toEqual([undefined, "합계", undefined, undefined, 4, 400000, 6000, 600, 6600, 393400]);
  });

  it("요약·내역 두 장", async () => {
    const buf = await renderMonthXlsx("2026-11", "하이원 스노우렌탈", [buildStatement(row)]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer); // exceljs 타입이 옛 Buffer 정의를 쓴다
    const sum = wb.getWorksheet("정산 요약")!;
    expect(sum.getRow(2).values).toEqual([undefined, "김스키", "개인 강사", "사업소득 3.3%", 2, 200000, 6000, 600, 6600, 193400, "정산서 발행"]);
    const items = wb.getWorksheet("강습 내역")!;
    expect(items.rowCount).toBe(3);
    expect(items.getRow(2).getCell(2).value).toBe("11/1(일) 10:00~12:00");
  });
});

describe("종목 3개 (P17)", () => {
  const mixed: SettlementRow = {
    ...row,
    settlement_items: [
      { amount: 120000, assignments: { jobs: { starts_at: "2026-11-01T04:00:00Z", ends_at: "2026-11-01T06:00:00Z", lesson_type: "semi", sports: { name: "스노우보드" } } } },
      { amount: 80000, assignments: { jobs: { starts_at: "2026-11-01T01:00:00Z", ends_at: "2026-11-01T03:00:00Z", lesson_type: "private", sports: { name: "스노우스케이트" } } } },
    ],
  };
  it("정산서·엑셀에 종목 이름이 그대로 나온다", async () => {
    const s = buildStatement(mixed);
    expect(s.items.map((i) => i.lesson)).toEqual(["스노우스케이트 1:1", "스노우보드 1:2"]);
    expect(Buffer.from((await renderStatementPdf(s)).slice(0, 5)).toString()).toBe("%PDF-");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderMonthXlsx("2026-11", "하이원 스노우렌탈", [s])) as unknown as ExcelJS.Buffer);
    const cells = wb.getWorksheet("강습 내역")!.getSheetValues().flat().map(String);
    expect(cells).toEqual(expect.arrayContaining(["스노우스케이트 1:1", "스노우보드 1:2"]));
  });
});

describe("특수문자·이모지·긴 이름 (P18-4)", () => {
  const weird: SettlementRow = {
    ...row,
    shops: { name: "<b>하이원</b> & \"렌탈\" ⛷️🏂", business_no: "000-00-00001" },
    instructors: { profiles: { name: `김스키😀${"가".repeat(80)}` } },
  };
  it("PDF·엑셀이 깨지지 않고 만들어진다", async () => {
    const s = buildStatement(weird);
    const pdf = await renderStatementPdf(s);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderMonthXlsx("2026-11", weird.shops!.name, [s])) as unknown as ExcelJS.Buffer);
    expect(wb.getWorksheet("정산 요약")!.getRow(2).getCell(1).value).toBe(s.payee.name);
  });
  it("수식처럼 보이는 이름이 엑셀에서 수식으로 실행되지 않는다", async () => {
    const s = buildStatement({ ...row, instructors: { profiles: { name: "=HYPERLINK(\"http://x\")" } } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderMonthXlsx("2026-11", "샵", [s])) as unknown as ExcelJS.Buffer);
    const v = wb.getWorksheet("정산 요약")!.getRow(2).getCell(1).value;
    expect(typeof v).toBe("string"); // 문자열 칸(t="s")으로 저장된다. 수식 칸({ formula })이 아니라 열어도 실행되지 않는다
  });
});
