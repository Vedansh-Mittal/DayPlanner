// Service Worker for Daylight Planner Push Notifications
self.addEventListener('push', function(event) {
  let data = { title: 'Daylight Planner', body: 'You have a new reminder!' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: self.location.origin + '/app',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// When user clicks the notification, open the app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If the app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data?.url || '/app');
      }
    })
  );
});
