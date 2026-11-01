// 손님 개인정보 안내·선택 동의 문구 (초안 — 법률 검토 전). 문구를 바꾸면 버전을 올린다: 동의 기록에 버전이 남는다.
// 손님 정보의 처리자는 각 샵이고, 겨울파트너는 샵의 위탁을 받아 처리한다(수탁자).

export const DRAFT_LABEL = "초안 — 법률 검토 전";

// 계약 이행(강습 진행)에 필요한 정보: 동의 없이 받고 안내만 한다
export const COLLECTION_NOTICE = {
  version: "notice-2026-11-v1",
  title: "손님 정보 수집 안내",
  body:
    "강습 예약·배정·연락을 위해 이름, 연락처(14세 미만은 보호자 이름·연락처), 강습 일시, 레벨, 장비 사이즈를 받습니다. " +
    "레벨과 수업 메모는 이 샵에서 강습을 맡는 강사에게만 제공되고, 다른 샵과는 공유하지 않습니다. " +
    "부상·질환 같은 건강 정보는 받지 않습니다.",
} as const;

export type OptionalConsentKind = "marketing" | "photo";

// 선택 동의: 손님(14세 미만은 보호자)이 직접 고른 것만 유효하다
export const OPTIONAL_CONSENTS: Record<OptionalConsentKind, { version: string; label: string; detail: string }> = {
  marketing: {
    version: "marketing-2026-11-v1",
    label: "시즌 안내·할인 소식 받기 (선택)",
    detail: "문자·카카오톡으로 시즌 오픈, 할인, 이벤트 소식을 받습니다. 동의하지 않아도 강습을 받을 수 있고, 언제든 철회할 수 있습니다. 2년마다 다시 확인합니다.",
  },
  photo: {
    version: "photo-2026-11-v1",
    label: "강습 사진·영상 촬영과 샵 홍보 사용 (선택)",
    detail: "강습 중 찍은 사진·영상을 샵 SNS·홈페이지에 올릴 수 있습니다. 동의하지 않아도 강습을 받을 수 있고, 언제든 철회할 수 있습니다.",
  },
};

export const CONSENT_SUBJECT_LABEL: Record<string, string> = { self: "본인", guardian: "보호자", staff: "직원 기록" };
export const CONSENT_METHOD_LABEL: Record<string, string> = { qr: "QR", link: "링크", onsite: "현장" };
