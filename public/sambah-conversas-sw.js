self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  if (payload.type !== "human_request" || !payload.alertId || !payload.eventKey) return;
  event.waitUntil(self.registration.showNotification("SamBah Central", {
    body: payload.messagePreview || "Atendimento aguardando humano.",
    tag: payload.eventKey,
    renotify: false,
    data: {
      alertId: payload.alertId,
      url: payload.url || "/conversas"
    }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || "/conversas";
  event.waitUntil((async () => {
    if (data.alertId) {
      try {
        await fetch(`/api/call-center/alerts/${encodeURIComponent(data.alertId)}/acknowledge`, { method: "POST" });
      } catch {}
    }
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(targetUrl);
        return;
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
