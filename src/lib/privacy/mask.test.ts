import { describe, expect, it } from "vitest";
import { maskPhone } from "./mask";

// 보안 11(개인정보): 목록 화면에서는 연락처 가운데를 가린다 (전체 번호는 열람 기록이 남는 손님 상세에서)
describe("maskPhone", () => {
  it("휴대폰은 앞 3자리·뒤 4자리만", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
    expect(maskPhone("01012345678")).toBe("010-****-5678");
    expect(maskPhone("02-123-4567")).toBe("02-****-4567"); // 서울 지역번호는 2자리
  });
  it("짧거나 숫자가 아니면 통째로 가린다", () => {
    expect(maskPhone("1234")).toBe("****");
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
  });
});
