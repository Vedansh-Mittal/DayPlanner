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
    alert('Push notifications are not supported in this browser.');
    return false;
  }

  // 2. Request permission (native browser prompt — always works in user-gesture)
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return false;
  }

  try {
    // 3. Register our service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // 4. Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJSON = subscription.toJSON();

    // 5. Save subscription to Supabase
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subJSON.endpoint!,
          p256dh: subJSON.keys!.p256dh!,
          auth: subJSON.keys!.auth!,
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('Failed to save push subscription:', error);
      return false;
    }

    console.log('Push subscription saved successfully');

    // Show a local welcome notification to confirm subscription is working
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
  } catch (err) {
    console.error('Push subscription failed:', err);
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

        // Then unsubscribe from browser
        await subscription.unsubscribe();
      }
    }
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}
