// 겨울파트너 서비스 워커: 웹푸시 알림 (P8-2). PWA 오프라인 셸은 P9-2에서 더한다.
self.addEventListener("push", (event) => {
  let msg = { title: "겨울파트너 알림", body: "", url: "/" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: msg.url },
      lang: "ko",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
