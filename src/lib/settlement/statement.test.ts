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
    const s = buildStatement({ ...row, instructors: null, payee: { name: "평창 라이딩스쿨" }, withholding: 0, net: 200000 });
    expect(s.payee).toEqual({ name: "평창 라이딩스쿨", kind: "강습팀" });
    expect(s.tax.total).toBe(0);
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
  it("요약·내역 두 장", async () => {
    const buf = await renderMonthXlsx("2026-11", "하이원 스노우렌탈", [buildStatement(row)]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer); // exceljs 타입이 옛 Buffer 정의를 쓴다
    const sum = wb.getWorksheet("정산 요약")!;
    expect(sum.getRow(2).values).toEqual([undefined, "김스키", "개인 강사", 2, 200000, 6000, 600, 6600, 193400, "정산서 발행"]);
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
