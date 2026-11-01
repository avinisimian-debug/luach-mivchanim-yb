self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'לוח מבחנים', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'לוח מבחנים', { body: d.body || '', dir: 'rtl', lang: 'he', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window' }).then((ws) => { for (const w of ws) if ('focus' in w) { w.navigate(url); return w.focus(); } return clients.openWindow(url); }));
});
