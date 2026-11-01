import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Statement } from "./statement";

// 나눔고딕(OFL, src/assets/fonts). pdf-lib의 subset은 한글 글리프를 빠뜨려서 글꼴 전체를 넣는다(PDF 약 1.6MB).
// 배포 시 파일 포함: next.config outputFileTracingIncludes
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const NAVY = rgb(0x0f / 255, 0x1e / 255, 0x3d / 255);
const MUTED = rgb(0x5b / 255, 0x6b / 255, 0x8a / 255);
const LINE = rgb(0xe1 / 255, 0xe6 / 255, 0xf0 / 255);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export async function renderStatementPdf(s: Statement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${s.title} - ${s.payee.name}`);
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, "NanumGothic-Regular.ttf")).then((b) => doc.embedFont(b, { subset: false })),
    readFile(path.join(FONT_DIR, "NanumGothic-Bold.ttf")).then((b) => doc.embedFont(b, { subset: false })),
  ]);

  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const text = (p: PDFPage, t: string, x: number, yy: number, size = 10, font: PDFFont = regular, color = rgb(0.08, 0.13, 0.23)) =>
    p.drawText(t, { x, y: yy, size, font, color });
  const right = (p: PDFPage, t: string, xr: number, yy: number, size = 10, font: PDFFont = regular) =>
    text(p, t, xr - font.widthOfTextAtSize(t, size), yy, size, font);

  // 머리
  text(page, s.title, M, y - 8, 18, bold, NAVY);
  right(page, s.status, W - M, y - 6, 10, regular);
  y -= 44;
  const info: [string, string][] = [
    ["지급하는 곳", `${s.shop.name}${s.shop.businessNo ? ` (사업자 ${s.shop.businessNo})` : ""}`],
    ["받는 분", `${s.payee.name} · ${s.payee.kind}`],
    ["정산 기간", `${s.month.replace("-", "년 ")}월 1일 ~ 말일 (샵 승인 강습)`],
  ];
  for (const [k, v] of info) {
    text(page, k, M, y, 10, regular, MUTED);
    text(page, v, M + 80, y, 10);
    y -= 18;
  }
  y -= 10;

  // 표
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.957, 0.965, 0.98) });
    text(page, "강습 일시", M + 8, y, 9, bold, MUTED);
    text(page, "강습", M + 220, y, 9, bold, MUTED);
    right(page, "확정 금액", W - M - 8, y, 9, bold);
    y -= 24;
  };
  header();
  for (const i of s.items) {
    if (y < M + 140) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    text(page, i.when, M + 8, y, 10);
    text(page, i.lesson, M + 220, y, 10);
    right(page, won(i.amount), W - M - 8, y, 10);
    page.drawLine({ start: { x: M, y: y - 7 }, end: { x: W - M, y: y - 7 }, thickness: 0.5, color: LINE });
    y -= 22;
  }

  // 합계
  y -= 8;
  const sums: [string, string, boolean][] = [
    [`강습료 합계 (${s.items.length}건)`, won(s.gross), false],
    ["소득세 (3%)", `- ${won(s.tax.incomeTax)}`, false],
    ["지방소득세 (0.3%)", `- ${won(s.tax.localTax)}`, false],
    ["실지급액", won(s.net), true],
  ];
  for (const [k, v, strong] of sums) {
    text(page, k, W - M - 240, y, strong ? 12 : 10, strong ? bold : regular, strong ? NAVY : MUTED);
    right(page, v, W - M - 8, y, strong ? 12 : 10, strong ? bold : regular);
    y -= strong ? 24 : 18;
  }
  y -= 16;
  const notes = [
    s.tax.total > 0
      ? "원천세는 사업소득 3.3%(소득세 3% + 지방소득세 0.3%)이며 각 10원 미만은 절사했습니다."
      : "원천징수 대상이 아닌 지급입니다(사업자 지급 또는 소액부징수).",
    "송금은 지급하는 곳에서 직접 합니다. 이 정산서는 겨울파트너에서 발행했습니다.",
  ];
  for (const n of notes) {
    text(page, n, M, y, 8.5, regular, MUTED);
    y -= 14;
  }
  return doc.save();
}
