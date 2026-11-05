// 채널 어댑터 공통 형식 (docs/ai-consult/README.md "아키텍처").
// 카카오·인스타·상담톡 웹훅은 각자 받은 요청을 NormalizedMessage로 바꾸고, 상담 엔진(runConsult)은 채널을 모른다.
import type { ConsultChannel } from "@/lib/ai/consult/types";

export type { ConsultChannel };

// 채널에서 받은 손님 메시지 한 건 (원래 손님 id는 저장 전에 hashExternalId로 해시한다 — 이 값 그대로 DB·로그에 쓰지 않는다)
export type NormalizedMessage = {
  channel: ConsultChannel;
  externalUserId: string; // 카카오 userRequest.user.id, 인스타 sender id
  text: string;
  messageId: string | null; // 채널이 준 메시지 id (없으면 어댑터를 부르는 쪽이 만든다)
  accountId: string | null; // 카카오 봇 id, 인스타 계정 id (shop_channels.external_id와 대조)
  displayName: string | null;
  replyUrl: string | null; // 카카오 callbackUrl (한 번만 쓸 수 있다)
};

export type DeliveryStatus = "sent" | "failed" | "skipped";

export type SendResult = { ok: boolean; status: DeliveryStatus; reason?: string; message?: string; tag?: string };
export type CanSendResult = { ok: boolean; tag?: string; reason?: string; message?: string };

export type SendOptions = { escalate?: boolean; approvedByOwner?: boolean };

// 보낼 대상. 채널마다 쓰는 값이 다르다(카카오는 callbackUrl, 인스타는 손님 id·마지막 손님 메시지 시각).
export type SendTarget = { replyUrl?: string | null; externalUserId?: string | null; lastCustomerMessageAt?: Date | null };

export interface ChannelAdapter<Raw = unknown> {
  readonly channel: ConsultChannel;
  // 검증·정규화. 처리할 메시지가 아니면 null (형식 오류·에코·스토리 답장 등)
  receive(raw: Raw): NormalizedMessage | null;
  send(target: SendTarget, text: string, opts?: SendOptions): Promise<SendResult>;
  canSend(target: SendTarget, now: Date, opts?: SendOptions): CanSendResult;
}
