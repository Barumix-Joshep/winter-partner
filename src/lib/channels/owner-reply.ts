// 사장님 인박스 [승인·발송(인스타)] (P22-5). DB·복호화·어댑터는 deps로 받는다(테스트에서 바꿔 끼움, 실제는 inbox/actions.ts).
// - 사장님 승인 경로라 approvedByOwner=true: 24시간 안은 RESPONSE, 24시간~7일은 Human Agent가 켜진 경우(META_HUMAN_AGENT=1)에만 HUMAN_AGENT,
//   7일이 지나면 거부. 판정은 어댑터(canSend)가 보내기 직전에 한다.
// - 창 밖이라 보내지 않은 경우는 기록하지 않고 이유만 알려 준다. 보냈거나 실패한 경우만 사장님 답장(role owner)으로 남긴다. 실패해도 다시 보내지 않는다.
// - 손님 인스타 id는 웹훅이 암호화해 둔 값(conversations.reply_to_enc)을 보낼 때만 메모리에서 푼다. 로그에 쓰지 않는다.
import type { ChannelAdapter, DeliveryStatus } from "./types";

export type OwnerSendTarget = {
  conversationId: string;
  channel: string;
  enabled: boolean;
  accountId: string | null;
  credentialsEnc: string | null;
  replyToEnc: string | null;
  lastCustomerMessageAt: string | null;
};

export type OwnerReplyRecord = { conversationId: string; text: string; delivery: DeliveryStatus; tag: string | null };

export type OwnerSendDeps = {
  loadTarget: (conversationId: string) => Promise<OwnerSendTarget | null>;
  decrypt: (enc: string) => string;
  makeSender: (accountId: string, accessToken: string) => Pick<ChannelAdapter, "send">;
  record: (r: OwnerReplyRecord) => Promise<void>;
};

export type OwnerSendResult = { ok: boolean; message: string };

const NO_LINK = "인스타그램 연결이 끊겨 보낼 수 없어요. 안내 정보 화면에서 다시 연결하거나 인스타그램 앱에서 답해 주세요.";
const NO_USER = "이 대화는 손님 계정 정보가 없어 보낼 수 없어요. 인스타그램 앱에서 직접 답해 주세요.";

export async function ownerSendInstagram(deps: OwnerSendDeps, conversationId: string, text: string): Promise<OwnerSendResult> {
  const t = await deps.loadTarget(conversationId);
  if (!t || t.channel !== "instagram") return { ok: false, message: "인스타그램 대화를 찾지 못했어요." };
  if (!t.enabled || !t.accountId || !t.credentialsEnc) return { ok: false, message: NO_LINK };
  if (!t.replyToEnc) return { ok: false, message: NO_USER };
  let token: string;
  let user: string;
  try {
    token = deps.decrypt(t.credentialsEnc);
    user = deps.decrypt(t.replyToEnc);
  } catch {
    return { ok: false, message: NO_USER };
  }
  const sender = deps.makeSender(t.accountId, token);
  const res = await sender.send(
    { externalUserId: user, lastCustomerMessageAt: t.lastCustomerMessageAt ? new Date(t.lastCustomerMessageAt) : null },
    text,
    { approvedByOwner: true },
  );
  if (res.status === "skipped") return { ok: false, message: res.message ?? "지금은 인스타그램으로 보낼 수 없어요. 인스타그램 앱에서 직접 답해 주세요." };
  try {
    await deps.record({ conversationId, text, delivery: res.status, tag: res.tag ?? null });
  } catch {
    // 이미 보냈는데 "실패"로 보이면 사장님이 다시 눌러 두 번 보낼 수 있다 → 보낸 사실은 그대로 알린다
    if (res.status === "sent") return { ok: true, message: "인스타그램으로 보냈어요. 다만 기록을 남기지 못했어요 — 새로고침해 확인해 주세요." };
  }
  if (res.status !== "sent") return { ok: false, message: "보내지 못했어요. 잠시 뒤 다시 시도하거나 인스타그램 앱에서 답해 주세요." };
  return { ok: true, message: res.tag === "HUMAN_AGENT" ? "인스타그램으로 보냈어요(24시간이 지나 Human Agent로)." : "인스타그램으로 보냈어요." };
}
