// Tukar service worker: Web Push only. No caching, no fetch interception. Registered from
// lib/push-client.ts after the user taps "Notify me", never on page load.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  const title = data.title || "Tukar";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "tukar-" + (data.kind || "note"),
        data: { url },
      }),
      // Mirror the payload to open tabs (the page can react without a click; the e2e reads it).
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: "tukar-push", data }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const open = cs.find((c) => c.url === url && "focus" in c);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
