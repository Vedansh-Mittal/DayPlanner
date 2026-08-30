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

  if (typeof Notification === 'undefined') {
    console.error('Notifications not supported by browser.');
    return false;
  }

  // If already denied, return false so settings can show the block alert
  if (Notification.permission === 'denied') {
    return false;
  }

  let permissionStatus: any = Notification.permission;

  if (permissionStatus === 'default') {
    try {
      // Call native browser prompt directly inside user-gesture stack (100% reliable prompt trigger)
      permissionStatus = (await Notification.requestPermission()) as NotificationPermission;
    } catch (err) {
      console.error('Native permission request failed:', err);
      return false;
    }
  }

  const isGranted = permissionStatus === 'granted';

  if (isGranted) {
    // Quietly sync with OneSignal in the background once permission is secured
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

        await window.OneSignal.User.pushSubscription.optIn();
      } catch (err) {
        console.error('OneSignal background registration failed:', err);
      }
    });
  }

  return isGranted;
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
