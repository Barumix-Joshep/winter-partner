import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationMessage } from "./messages";
import { pushErrorSummary } from "./error-summary";

const configured = () =>
  !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// 쌓인 알림을 웹푸시로 보낸다. 구독이 없는 사람은 앱의 알림 목록에서만 본다.
// 알림톡이 승인되면 여기서 채널을 나눈다 (P8-1).
export async function dispatchPending(limit = 50) {
  if (!configured()) return { sent: 0, skipped: "웹푸시 키가 없습니다" };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://winter-partner.vercel.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const db = createAdminClient();

  const { data: rows } = await db.rpc("claim_notifications", { p_limit: limit });
  const notes = (rows ?? []) as { id: string; user_id: string; kind: string; payload: Record<string, unknown> }[];
  if (notes.length === 0) return { sent: 0 };

  const jobIds = [...new Set(notes.map((n) => n.payload.job_id).filter((v): v is string => typeof v === "string"))];
  const userIds = [...new Set(notes.map((n) => n.user_id))];
  const [{ data: jobs }, { data: subs }] = await Promise.all([
    jobIds.length ? db.from("jobs").select("id, starts_at, ends_at, shops(name)").in("id", jobIds) : Promise.resolve({ data: [] }),
    db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
  ]);
  const jobMap = new Map(
    ((jobs ?? []) as unknown as { id: string; starts_at: string; ends_at: string; shops: { name: string } | null }[]).map((j) => [
      j.id,
      { starts_at: j.starts_at, ends_at: j.ends_at, shop: j.shops?.name ?? null },
    ]),
  );

  let sent = 0;
  const dead: string[] = [];
  for (const n of notes) {
    const msg = notificationMessage(n.kind, n.payload, jobMap.get(n.payload.job_id as string) ?? null);
    for (const s of (subs ?? []).filter((x) => x.user_id === n.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400 });
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // 만료된 구독
        else console.error("웹푸시 실패", pushErrorSummary(e));
      }
    }
  }
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return { sent };
}

// 서버 액션에서 알림이 생기는 일을 한 뒤 부른다. 응답을 늦추지 않도록 응답 뒤에 보낸다.
export function notifyAfterResponse() {
  after(async () => {
    try {
      await dispatchPending();
    } catch (e) {
      console.error("알림 발송 실패", pushErrorSummary(e));
    }
  });
}
