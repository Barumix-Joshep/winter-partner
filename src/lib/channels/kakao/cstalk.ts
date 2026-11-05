// 카카오 상담톡(유료, 상담 솔루션 연동) 어댑터 껍데기. 1단계에서는 무료 챗봇(KakaoAdapter)만 쓰고, 상담톡은 세 함수 모두 "지원 안 함".
import type { CanSendResult, ChannelAdapter, SendResult, SendTarget } from "../types";

const UNSUPPORTED = { reason: "unsupported", message: "지원 안 함" } as const;

export class KakaoCsTalkAdapter implements ChannelAdapter<unknown> {
  readonly channel = "kakao_cstalk" as const;
  receive(_raw: unknown): null {
    void _raw;
    return null;
  }
  async send(_target: SendTarget, _text: string): Promise<SendResult> {
    void _target;
    void _text;
    return { ok: false, status: "skipped", ...UNSUPPORTED };
  }
  canSend(_target: SendTarget, _now: Date): CanSendResult {
    void _target;
    void _now;
    return { ok: false, ...UNSUPPORTED };
  }
}
