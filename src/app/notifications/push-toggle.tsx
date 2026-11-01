"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "./actions";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "unsupported" | "denied" | "off" | "on" | "busy";

// 이 기기에서 웹푸시 알림 켜기·끄기. 아이폰은 홈 화면에 추가한 뒤에만 된다.
export function PushToggle() {
  const [state, setState] = useState<State>("busy");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !KEY) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
      const r = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setState(r.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  const note: Record<State, string> = {
    unsupported: "이 브라우저는 알림을 지원하지 않습니다. 아이폰은 Safari 공유 → 홈 화면에 추가 후 열어 주세요.",
    denied: "알림이 차단돼 있습니다. 브라우저 설정에서 이 사이트 알림을 허용해 주세요.",
    off: "의뢰·선정·취소·정산 알림을 이 기기로 받습니다.",
    on: "이 기기로 알림을 받고 있습니다.",
    busy: "확인 중…",
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white p-4">
      <p className="min-w-0 flex-1 text-sm text-ink-muted">{note[state]}</p>
      {(state === "off" || state === "on") && (
        <button
          onClick={state === "on" ? turnOff : turnOn}
          className={`min-h-11 rounded-[10px] px-4 text-sm font-medium ${state === "on" ? "border border-line" : "bg-brand text-white"}`}
        >
          {state === "on" ? "알림 끄기" : "알림 켜기"}
        </button>
      )}
    </div>
  );
}
