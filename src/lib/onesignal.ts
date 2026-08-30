const ONESIGNAL_APP_ID = '425d855f-6ca6-4145-989f-800043b9635c';

declare global {
  interface Window {
    OneSignal?: any;
  }
}

/** Initialize OneSignal quietly in the background without prompting for permission */
export function initOneSignalQuietly(userId: string) {
  if (typeof window === 'undefined') return;
  window.OneSignal = window.OneSignal || [];
  window.OneSignal.push(async function() {
    try {
      await window.OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        autoRegister: false, // Ensure no automatic registration prompts
      });
      if (userId) {
        await window.OneSignal.login(userId);
      }
    } catch (err) {
      console.error('OneSignal quiet initialization failed:', err);
    }
  });
}

/** Explicitly prompt the user for push notification permission */
export async function requestOneSignalPushPermission(userId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const OneSignal = window.OneSignal;
  // If OneSignal is already initialized and loaded, invoke requestPermission synchronously to preserve user-gesture
  if (OneSignal && typeof OneSignal.Notifications?.requestPermission === 'function') {
    try {
      if (userId) {
        await OneSignal.login(userId);
      }
      await OneSignal.Notifications.requestPermission();
      const hasPermission = OneSignal.Notifications.permission;
      if (hasPermission) {
        await OneSignal.User.pushSubscription.optIn();
      }
      return hasPermission;
    } catch (err) {
      console.error('Direct OneSignal permission request failed:', err);
    }
  }

  // Fallback to queue if not fully loaded/initialized yet
  return new Promise((resolve) => {
    window.OneSignal = window.OneSignal || [];
    window.OneSignal.push(async function() {
      try {
        await window.OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          autoRegister: false,
        });

        if (userId) {
          await window.OneSignal.login(userId);
        }

        await window.OneSignal.Notifications.requestPermission();
        
        const hasPermission = window.OneSignal.Notifications.permission;
        if (hasPermission) {
          await window.OneSignal.User.pushSubscription.optIn();
        }
        resolve(hasPermission);
      } catch (err) {
        console.error('OneSignal permission request failed:', err);
        resolve(false);
      }
    });
  });
}

/** Turn off push notifications for this browser session */
export function disableOneSignalPush() {
  if (typeof window === 'undefined') return;
  window.OneSignal = window.OneSignal || [];
  window.OneSignal.push(async function() {
    try {
      await window.OneSignal.User.pushSubscription.optOut();
    } catch (err) {
      console.error('OneSignal optOut failed:', err);
    }
  });
}

/** Logout / Disassociate user when they log out from Daylight */
export function logoutOneSignal() {
  if (typeof window === 'undefined') return;
  window.OneSignal = window.OneSignal || [];
  window.OneSignal.push(async function() {
    try {
      await window.OneSignal.logout();
    } catch (err) {
      console.error('OneSignal logout failed:', err);
    }
  });
}
