// CSV 읽기·쓰기 (손님·강사 일괄 등록, P16-4). 엑셀에서 "CSV UTF-8"로 저장한 파일을 기준으로 한다.

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// 엑셀에서 =, +, -, @로 시작하는 값은 수식으로 실행될 수 있어 앞에 '를 붙인다
const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

export function toCsv(rows: string[][]): string {
  const line = (r: string[]) => r.map((v) => safe(v)).map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",");
  return "﻿" + rows.map(line).join("\r\n") + "\r\n";
}
