import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { useThemeStore } from '../stores/theme-store';
import { setWaterGoalForDate } from '../lib/water-goal-history';
import type { UserSettings } from '../types/database';

export function useUserSettings() {
  const user = useAuthStore((s) => s.user);
  const initTheme = useThemeStore((s) => s.initialize);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (!settings) {
      setLoading(true);
    }
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load settings:', error);
      setLoading(false);
      return;
    }

    if (data) {
      setSettings(data as UserSettings);
      initTheme(data.theme as UserSettings['theme']);
    } else {
      // No settings yet (new user) → init theme with system
      initTheme('system');
    }
    setLoading(false);
  }, [user, initTheme]);

  useEffect(() => { load(); }, [load]);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!user) return;
    if (typeof updates.water_goal === 'number') {
      setWaterGoalForDate(updates.water_goal);
    }
    const payload = { ...updates, user_id: user.id, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
    setSettings(data as UserSettings);
    return data as UserSettings;
  }, [user]);

  const completeOnboarding = useCallback(async (initial: Partial<UserSettings>) => {
    if (!user) return;
    const payload: Partial<UserSettings> & { user_id: string } = {
      user_id: user.id,
      display_name: initial.display_name || null,
      timezone: initial.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      morning_reminder: initial.morning_reminder || null,
      night_reminder: initial.night_reminder || null,
      water_goal: initial.water_goal ?? 8,
      email_reminders: initial.email_reminders ?? false,
      push_reminders_enabled: initial.push_reminders_enabled ?? false,
      theme: 'system',
      onboarding_complete: true,
    };

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Failed to save onboarding:', error);
      throw error;
    }
    setSettings(data as UserSettings);
    return data as UserSettings;
  }, [user]);

  return { settings, loading, updateSettings, completeOnboarding, reload: load };
}
