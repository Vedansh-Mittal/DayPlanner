import { useEffect, useRef, useCallback } from 'react';
import { useUserSettings } from './useUserSettings';

/**
 * Checks every 30 seconds whether the current time matches the user's
 * configured morning or night reminder times. If it does (and we haven't
 * already fired for this minute), fire a browser Notification.
 *
 * Requires Notification API permission. Does nothing if:
 *  - reminders are disabled in settings
 *  - Notification permission is not 'granted'
 */
export function useNotificationReminders() {
  const { settings } = useUserSettings();
  const firedRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndNotify = useCallback(() => {
    if (!settings) return;
    if (!settings.email_reminders) return; // user has reminders disabled
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Check morning reminder
    if (settings.morning_reminder && currentTime === settings.morning_reminder) {
      const key = `morning-${todayKey}`;
      if (!firedRef.current.has(key)) {
        firedRef.current.add(key);
        new Notification('☀️ Good Morning!', {
          body: 'Time to fill in your morning planner. Start your day with intention!',
          icon: '/favicon.ico',
          tag: 'daylight-morning',
        });
      }
    }

    // Check night reminder
    if (settings.night_reminder && currentTime === settings.night_reminder) {
      const key = `night-${todayKey}`;
      if (!firedRef.current.has(key)) {
        firedRef.current.add(key);
        new Notification('🌙 Time to Reflect', {
          body: 'Wind down your day with your evening reflection.',
          icon: '/favicon.ico',
          tag: 'daylight-night',
        });
      }
    }

    // Clean up old keys (keep only today's)
    firedRef.current.forEach((k) => {
      if (!k.endsWith(todayKey)) firedRef.current.delete(k);
    });
  }, [settings]);

  useEffect(() => {
    // Start checking every 30 seconds
    checkAndNotify(); // check immediately
    intervalRef.current = setInterval(checkAndNotify, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkAndNotify]);
}

/**
 * Request browser notification permission.
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result;
}
