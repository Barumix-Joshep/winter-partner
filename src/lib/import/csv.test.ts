import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("엑셀이 붙이는 BOM·CRLF·빈 줄을 처리한다", () => {
    expect(parseCsv("﻿이름,휴대폰\r\n김손님,010-1111-2222\r\n\r\n")).toEqual([
      ["이름", "휴대폰"],
      ["김손님", "010-1111-2222"],
    ]);
  });
  it("따옴표 안의 쉼표·줄바꿈·따옴표", () => {
    expect(parseCsv('a,"b, c","줄\n바꿈","그는 ""네""라고"\n')).toEqual([["a", "b, c", "줄\n바꿈", '그는 "네"라고']]);
  });
  it("앞뒤 공백을 지운다", () => {
    expect(parseCsv(" 김 , 010 ")).toEqual([["김", "010"]]);
  });
});

describe("toCsv", () => {
  it("엑셀이 한글을 읽도록 BOM을 붙이고, 필요한 칸만 따옴표", () => {
    expect(toCsv([["이름", "메모"], ["김", "a,b"]])).toBe('﻿이름,메모\r\n김,"a,b"\r\n');
  });
  it("수식으로 실행될 수 있는 값은 앞에 따옴표를 붙인다", () => {
    expect(toCsv([["=1+1"]])).toBe("﻿'=1+1\r\n");
  });
});
