// 샵·강습팀 등록 폼 검증

export type ShopType = "rental_shop" | "lesson_team";

export type ShopInput = {
  type: ShopType;
  name: string;
  businessNo: string | null;
  ownerName: string | null;
  resortIds: number[];
};

type Result = { ok: true; data: ShopInput } | { ok: false; errors: Partial<Record<keyof ShopInput, string>> };

const TYPES: readonly ShopType[] = ["rental_shop", "lesson_team"];

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function parseShop(fd: FormData): Result {
  const type = text(fd, "type") as ShopType;
  const name = text(fd, "name");
  const ownerName = text(fd, "owner_name") || null;
  const rawBiz = text(fd, "business_no");
  const rawResorts = fd.getAll("resort_ids").map(String);
  const errors: Partial<Record<keyof ShopInput, string>> = {};

  if (!TYPES.includes(type)) errors.type = "렌탈샵 또는 강습팀을 골라 주세요.";
  if (!name) errors.name = "샵 이름을 입력해 주세요.";

  let businessNo: string | null = null;
  if (rawBiz) {
    const digits = rawBiz.replace(/\D/g, "");
    if (digits.length === 10 && /^[\d\s-]+$/.test(rawBiz)) {
      businessNo = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    } else {
      errors.businessNo = "사업자등록번호 10자리를 확인해 주세요.";
    }
  }

  const resortIds = rawResorts.map(Number);
  if (resortIds.length === 0) errors.resortIds = "영업 스키장을 하나 이상 골라 주세요.";
  else if (resortIds.some((n) => !Number.isInteger(n) || n <= 0)) errors.resortIds = "스키장 선택을 다시 해 주세요.";

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, data: { type, name, businessNo, ownerName, resortIds } };
}
