const VAPID_PUBLIC_KEY = 'BHc1mC6s4uc-fzWWAdy_Ofz__esl-22dkc75aXdloFeW4NiPQZZ0BYmHtKKq3G2wFiAAbblHUpwaLefcyBUibo0';

import { supabase } from './supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Request notification permission, subscribe via service worker,
 * and save the subscription to Supabase.
 */
export async function subscribeToPush(userId: string): Promise<boolean> {
  // 1. Check browser support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert(
      'Push notifications are not supported in this browser.\n\n' +
      'If you are using an iPhone/iPad (iOS), please tap Share ➔ "Add to Home Screen" and open the app from your Home Screen to enable notifications.'
    );
    return false;
  }

  // 2. Check if already blocked in site settings
  if ('Notification' in window && Notification.permission === 'denied') {
    alert(
      'Notifications are currently blocked in your browser site settings.\n\n' +
      'To enable notifications:\n' +
      '1. Tap the lock/tune icon (🔒 or ⚙️) next to the web address (URL bar)\n' +
      '2. Select "Permissions" or "Site settings"\n' +
      '3. Change Notifications to "Allow"\n' +
      '4. Refresh this page and try again!'
    );
    return false;
  }

  // 3. Request permission
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (permission === 'denied') {
        alert(
          'Notification permission was denied.\n\n' +
          'To enable notifications later, tap the lock icon (🔒) in your browser address bar, go to Site Settings, and set Notifications to "Allow".'
        );
      }
      return false;
    }
  } catch (err: any) {
    alert(`Could not request notification permission: ${err?.message || err}`);
    return false;
  }

  try {
    // 4. Register our service worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 5. Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJSON = subscription.toJSON();

    if (!subJSON.endpoint || !subJSON.keys?.p256dh || !subJSON.keys?.auth) {
      alert('Failed to obtain valid push subscription details from the browser.');
      return false;
    }

    // 6. Save subscription to Supabase
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('Failed to save push subscription:', error);
      alert(`Failed to save subscription to database: ${error.message}`);
      return false;
    }

    console.log('Push subscription saved successfully');

    // 7. Enable push reminders in user_settings
    const { error: settingsError } = await supabase
      .from('user_settings')
      .update({ push_reminders_enabled: true })
      .eq('user_id', userId);

    if (settingsError) {
      console.error('Failed to enable push reminders in settings:', settingsError);
    }

    // 8. Show local welcome notification
    try {
      await registration.showNotification('Daylight Planner', {
        body: 'Thanks for subscribing to push notifications! 🔔',
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [100, 50, 100],
      } as any);
    } catch (e) {
      console.warn('Failed to show local welcome notification:', e);
    }

    return true;
  } catch (err: any) {
    console.error('Push subscription failed:', err);
    alert(`Push subscription error: ${err?.message || String(err)}`);
    return false;
  }
}

/**
 * Unsubscribe from push notifications and remove from Supabase.
 */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Remove from Supabase first
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', subscription.endpoint);

        // NEW — flip the flag back off so the cron job stops trying to
        // send this user reminders after they've opted out.
        const { error: settingsError } = await supabase
          .from('user_settings')
          .update({ push_reminders_enabled: false })
          .eq('user_id', userId);

        if (settingsError) {
          console.error('Failed to disable push reminders in settings:', settingsError);
        }

        // Then unsubscribe from browser
        await subscription.unsubscribe();
      }
    }
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}