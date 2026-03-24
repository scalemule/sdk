/**
 * Web Push Service Worker Template
 *
 * Exports a JavaScript string that can be served as a service worker.
 * Customers can either:
 * 1. Use this string with a Next.js API route to serve dynamically
 * 2. Copy the content into their own public/sw.js
 *
 * The service worker handles:
 * - push events: parse JSON, show notification
 * - notificationclick: open/focus app window
 * - message posting to client pages for foreground handling
 */

export const WEB_PUSH_SERVICE_WORKER = `
// ScaleMule Push Notification Service Worker

self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'New Notification', body: event.data.text() };
  }

  var title = data.title || 'Notification';
  var options = {
    body: data.body || '',
    icon: data.icon || undefined,
    image: data.image || undefined,
    badge: data.badge || undefined,
    data: data.data || data,
    tag: data.tag || undefined,
    actions: data.actions || undefined,
    requireInteraction: data.requireInteraction || false,
  };

  // Show the notification
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(function() {
        // Post message to all client pages for foreground handling
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({
            type: 'push-received',
            payload: data,
          });
        });
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var url = '/';
  if (event.notification.data && event.notification.data.url) {
    url = event.notification.data.url;
  }

  // Handle action button clicks
  if (event.action && event.notification.data && event.notification.data.actions) {
    var action = event.notification.data.actions.find(function(a) {
      return a.action === event.action;
    });
    if (action && action.url) {
      url = action.url;
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Try to focus an existing window
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.indexOf(self.registration.scope) !== -1 && 'focus' in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Open a new window if none exists
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
`;
