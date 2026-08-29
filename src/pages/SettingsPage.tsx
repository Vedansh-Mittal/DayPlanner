import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserSettings } from '../hooks/useUserSettings';
import { useAuthStore } from '../stores/auth-store';
import { useThemeStore, type ThemePreference } from '../stores/theme-store';
import { supabase } from '../lib/supabase';
import { getAllTimezones } from '../lib/utils';
import {
  Settings as SettingsIcon, User, Globe, Clock, Droplets, Bell,
  Palette, LogOut, Trash2, Loader2, Check, Sun, Moon, Monitor,
} from 'lucide-react';

const timezones = getAllTimezones();

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, loading: settingsLoading } = useUserSettings();
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user);
  const { preference: themePref, setPreference: setThemePref } = useThemeStore();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState(settings?.display_name || '');
  const [timezone, setTimezone] = useState(settings?.timezone || '');
  const [tzSearch, setTzSearch] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const [morningReminder, setMorningReminder] = useState(settings?.morning_reminder || '08:00');
  const [nightReminder, setNightReminder] = useState(settings?.night_reminder || '21:00');
  const [waterGoal, setWaterGoal] = useState(settings?.water_goal || 8);
  const [emailReminders, setEmailReminders] = useState(settings?.email_reminders || false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync local state when settings load
  React.useEffect(() => {
    if (settings) {
      setDisplayName(settings.display_name || '');
      setTimezone(settings.timezone);
      setMorningReminder(settings.morning_reminder || '08:00');
      setNightReminder(settings.night_reminder || '21:00');
      setWaterGoal(settings.water_goal);
      setEmailReminders(settings.email_reminders);
    }
  }, [settings]);

  const filteredTz = tzSearch
    ? timezones.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()))
    : timezones;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        display_name: displayName || null,
        timezone,
        morning_reminder: morningReminder,
        night_reminder: nightReminder,
        water_goal: waterGoal,
        email_reminders: emailReminders,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handled by hook
    }
    setSaving(false);
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    setThemePref(theme);
    try {
      await updateSettings({ theme });
    } catch {
      // non-critical
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleDeleteData = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Delete all user data in order (child tables first due to FK)
      await supabase.from('wind_down_items').delete().eq('user_id', user.id);
      await supabase.from('meals').delete().eq('user_id', user.id);
      await supabase.from('medications').delete().eq('user_id', user.id);
      await supabase.from('action_steps').delete().eq('user_id', user.id);
      await supabase.from('priorities').delete().eq('user_id', user.id);
      await supabase.from('daily_entries').delete().eq('user_id', user.id);
      await supabase.from('user_settings').delete().eq('user_id', user.id);
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Delete error:', err);
    }
    setDeleting(false);
  };

  if (settingsLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text">
        <SettingsIcon size={24} className="inline mr-2 text-lavender" />
        Settings
      </h1>

      {/* Profile */}
      <section className="card space-y-4">
        <h2 className="section-title">
          <User size={18} className="text-lavender" />
          Profile
        </h2>
        <div>
          <label className="block text-sm font-semibold mb-1.5">Display name</label>
          <input
            type="text"
            className="input-field"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div className="relative">
          <label className="block text-sm font-semibold mb-1.5">
            <Globe size={14} className="inline mr-1" />
            Timezone
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="Search timezone…"
            value={tzOpen ? tzSearch : timezone}
            onFocus={() => { setTzOpen(true); setTzSearch(''); }}
            onChange={(e) => setTzSearch(e.target.value)}
            onBlur={() => setTimeout(() => setTzOpen(false), 200)}
          />
          {tzOpen && (
            <div className="tz-dropdown">
              {filteredTz.slice(0, 50).map((tz) => (
                <div
                  key={tz}
                  className={`tz-dropdown-item ${tz === timezone ? 'highlighted' : ''}`}
                  onMouseDown={() => {
                    setTimezone(tz);
                    setTzOpen(false);
                    setTzSearch('');
                  }}
                >
                  {tz}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Reminders */}
      <section className="card space-y-4">
        <h2 className="section-title">
          <Clock size={18} className="text-blue-soft" />
          Reminders
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">☀️ Morning</label>
            <input
              type="time"
              className="input-field"
              value={morningReminder}
              onChange={(e) => setMorningReminder(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">🌙 Night</label>
            <input
              type="time"
              className="input-field"
              value={nightReminder}
              onChange={(e) => setNightReminder(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox-custom"
            checked={emailReminders}
            onChange={async (e) => {
              const checked = e.target.checked;
              setEmailReminders(checked);
              if (checked) {
                const { requestNotificationPermission } = await import('../hooks/useNotificationReminders');
                const permission = await requestNotificationPermission();
                if (permission === 'denied') {
                  alert('Notification permission is blocked. Please enable notifications in your browser settings to receive reminders.');
                } else if (permission === 'unsupported') {
                  alert('Notifications are not supported in this browser.');
                }
              }
            }}
          />
          <span className="text-sm font-semibold flex items-center gap-1.5">
            <Bell size={14} /> Enable browser reminders
          </span>
        </label>
      </section>

      {/* Water goal */}
      <section className="card space-y-3">
        <h2 className="section-title">
          <Droplets size={18} className="text-blue-soft" />
          Water Goal
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="water-btn"
            onClick={() => setWaterGoal(Math.max(1, waterGoal - 1))}
          >−</button>
          <span className="text-2xl font-bold w-10 text-center">{waterGoal}</span>
          <button
            type="button"
            className="water-btn"
            onClick={() => setWaterGoal(waterGoal + 1)}
          >+</button>
          <span className="text-sm text-text-muted">glasses/day</span>
        </div>
      </section>

      {/* Theme */}
      <section className="card space-y-3">
        <h2 className="section-title">
          <Palette size={18} className="text-peach" />
          Theme
        </h2>
        <div className="flex gap-3">
          {([
            { value: 'light' as const, icon: Sun, label: 'Light' },
            { value: 'dark' as const, icon: Moon, label: 'Dark' },
            { value: 'system' as const, icon: Monitor, label: 'System' },
          ]).map((t) => (
            <button
              key={t.value}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                themePref === t.value
                  ? 'border-lavender bg-lavender-light dark:bg-lavender-dark/20 text-lavender-dark dark:text-lavender'
                  : 'border-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:border-lavender/50'
              }`}
              onClick={() => handleThemeChange(t.value)}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* Save button */}
      <button
        className="btn-primary w-full py-3"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? (
          <Loader2 size={18} className="animate-spin" />
        ) : saved ? (
          <>
            <Check size={18} />
            Saved!
          </>
        ) : (
          'Save Changes'
        )}
      </button>

      {/* Logout */}
      <button
        className="btn-secondary w-full py-3"
        onClick={handleLogout}
      >
        <LogOut size={18} />
        Log Out
      </button>

      {/* Delete data */}
      <div className="card border-red-200 dark:border-red-900/30">
        <h2 className="section-title text-red-500">
          <Trash2 size={18} />
          Delete All Data
        </h2>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
          This will permanently delete all your planner entries, settings, and data.
          Your authentication account will remain, but all planner data will be gone forever.
        </p>

        {!showDeleteConfirm ? (
          <button
            className="btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete my data
          </button>
        ) : (
          <div className="space-y-3 bg-red-50 dark:bg-red-900/10 p-4 rounded-xl">
            <p className="text-sm font-bold text-red-600">
              Are you absolutely sure? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-danger flex-1"
                onClick={handleDeleteData}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : 'Yes, delete everything'}
              </button>
              <button
                className="btn-ghost flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
