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
  Download, Upload, FileText
} from 'lucide-react';
import { requestOneSignalPushPermission, disableOneSignalPush } from '../lib/onesignal';

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
  const [pushRemindersEnabled, setPushRemindersEnabled] = useState(settings?.push_reminders_enabled || false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const handleExportJSON = async () => {
    if (!user) return;
    setBackingUp(true);
    try {
      const { data: entries } = await supabase
        .from('daily_entries')
        .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*), medications(*)')
        .eq('user_id', user.id);

      const backupData = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        entries: entries || []
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `daylight_planner_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Export error:', err);
    }
    setBackingUp(false);
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setRestoring(true);
    setRestoreSuccess(false);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const backup = JSON.parse(event.target?.result as string);
          if (!backup || !Array.isArray(backup.entries)) {
            alert('Invalid backup file structure.');
            setRestoring(false);
            return;
          }

          // Restore each entry and child rows
          for (const entry of backup.entries) {
            const entryId = entry.id;

            // 1. Upsert daily entry row (remove nested arrays first)
            const { priorities, action_steps, meals, wind_down_items, medications, ...entryRow } = entry;
            entryRow.user_id = user.id;

            await supabase.from('daily_entries').upsert(entryRow);

            // 2. Restore child relation rows
            if (Array.isArray(priorities) && priorities.length > 0) {
              await supabase.from('priorities').upsert(
                priorities.map((p: any) => ({ ...p, daily_entry_id: entryId, user_id: user.id }))
              );
            }
            if (Array.isArray(action_steps) && action_steps.length > 0) {
              await supabase.from('action_steps').upsert(
                action_steps.map((a: any) => ({ ...a, daily_entry_id: entryId, user_id: user.id }))
              );
            }
            if (Array.isArray(meals) && meals.length > 0) {
              await supabase.from('meals').upsert(
                meals.map((m: any) => ({ ...m, daily_entry_id: entryId, user_id: user.id }))
              );
            }
            if (Array.isArray(wind_down_items) && wind_down_items.length > 0) {
              await supabase.from('wind_down_items').upsert(
                wind_down_items.map((w: any) => ({ ...w, daily_entry_id: entryId, user_id: user.id }))
              );
            }
            if (Array.isArray(medications) && medications.length > 0) {
              await supabase.from('medications').upsert(
                medications.map((med: any) => ({ ...med, daily_entry_id: entryId, user_id: user.id }))
              );
            }
          }

          setRestoreSuccess(true);
          setTimeout(() => setRestoreSuccess(false), 3000);
          alert('Backup restored successfully!');
        } catch (err) {
          console.error(err);
          alert('Error parsing or saving backup data.');
        } finally {
          setRestoring(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setRestoring(false);
    }
  };

  const handlePrintDigest = async () => {
    if (!user) return;
    try {
      const { data: entries } = await supabase
        .from('daily_entries')
        .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*), medications(*)')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (!entries || entries.length === 0) {
        alert('No entries found to generate a print digest.');
        return;
      }

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Daylight Planner Journal Digest</title>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');
                body { font-family: 'Nunito', sans-serif; padding: 2.5rem; color: #2d3748; background-color: #ffffff; }
                h1 { text-align: center; color: #4f46e5; margin-bottom: 0.5rem; font-size: 2.25rem; font-weight: 800; }
                .subtitle { text-align: center; color: #718096; margin-bottom: 3rem; font-size: 0.95rem; }
                .entry { border-bottom: 2px dashed #e2e8f0; padding: 2rem 0; page-break-inside: avoid; }
                .entry:last-child { border-bottom: none; }
                .date { font-size: 1.5rem; font-weight: 800; color: #1a202c; margin-bottom: 1.25rem; border-left: 4px solid #818cf8; padding-left: 0.75rem; }
                .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 2rem; }
                @media (max-width: 600px) { .grid { grid-template-cols: 1fr; } }
                .section { margin-bottom: 1.5rem; }
                .section-title { font-weight: 700; color: #4f46e5; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
                .text { font-size: 0.95rem; line-height: 1.6; color: #4a5568; margin-bottom: 0.5rem; }
                .item-list { margin: 0; padding-left: 1.25rem; font-size: 0.95rem; line-height: 1.6; color: #4a5568; }
                .badge { inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-left: 0.5rem; }
                .badge-completed { background-color: #def7ec; color: #03543f; }
                .badge-pending { background-color: #fef3c7; color: #92400e; }
              </style>
            </head>
            <body>
              <h1>Daylight Planner</h1>
              <div class="subtitle">Personal Journal Digest • Generated on ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              ${entries.map(e => {
                const datePretty = new Date(e.entry_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const morningStatusBadge = e.morning_completed ? '<span class="badge badge-completed">Complete</span>' : '<span class="badge badge-pending">In Progress</span>';
                const nightStatusBadge = e.night_completed ? '<span class="badge badge-completed">Complete</span>' : '<span class="badge badge-pending">In Progress</span>';

                return `
                  <div class="entry">
                    <div class="date">${datePretty}</div>
                    <div class="grid">
                      <div>
                        <div class="section">
                          <div class="section-title">☀️ Morning Planner ${morningStatusBadge}</div>
                          <div class="text"><strong>Mood:</strong> ${e.morning_mood || 'Unrecorded'} (Intensity: ${e.morning_mood_intensity || 'N/A'}/10)</div>
                          <div class="text"><strong>Why:</strong> ${e.morning_why || 'Unrecorded'}</div>
                          <div class="text"><strong>Inspire me:</strong> ${e.morning_inspire || 'Unrecorded'}</div>
                          <div class="text"><strong>Brain Dump:</strong> ${e.morning_brain_dump || 'None'}</div>
                        </div>
                        <div class="section">
                          <div class="section-title">🎯 Focus Priorities</div>
                          <ol class="item-list">
                            ${(e.priorities || []).map((p: any) => `<li>${p.text || ''}</li>`).join('') || '<li>None</li>'}
                          </ol>
                        </div>
                        <div class="section">
                          <div class="section-title">👟 Plan of Action</div>
                          <ol class="item-list">
                            ${(e.action_steps || []).map((a: any) => `<li>${a.text || ''}</li>`).join('') || '<li>None</li>'}
                          </ol>
                        </div>
                      </div>
                      <div>
                        <div class="section">
                          <div class="section-title">🌙 Night Reflection ${nightStatusBadge}</div>
                          <div class="text"><strong>Mood:</strong> ${e.night_mood || 'Unrecorded'} (Intensity: ${e.night_mood_intensity || 'N/A'}/10)</div>
                          <div class="text"><strong>Win of the Day:</strong> ${e.night_win || 'Unrecorded'}</div>
                          <div class="text"><strong>What Went Well:</strong> ${e.night_went_well || 'Unrecorded'}</div>
                          <div class="text"><strong>Improvement:</strong> ${e.night_improve || 'Unrecorded'}</div>
                          <div class="text"><strong>Intention:</strong> ${e.night_intention || 'Unrecorded'}</div>
                          <div class="text"><strong>Hydration:</strong> ${e.water_count || 0} glasses</div>
                        </div>
                        <div class="section">
                          <div class="section-title">🙏 Gratitudes</div>
                          <ul class="item-list">
                            ${e.night_gratitude_1 ? `<li>${e.night_gratitude_1}</li>` : ''}
                            ${e.night_gratitude_2 ? `<li>${e.night_gratitude_2}</li>` : ''}
                            ${e.night_gratitude_3 ? `<li>${e.night_gratitude_3}</li>` : ''}
                            ${(!e.night_gratitude_1 && !e.night_gratitude_2 && !e.night_gratitude_3) ? '<li>None</li>' : ''}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
              <script>
                window.onload = function() {
                  window.print();
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sync local state when settings load
  React.useEffect(() => {
    if (settings && !hasInitialized) {
      setDisplayName(settings.display_name || '');
      setTimezone(settings.timezone);
      setMorningReminder(settings.morning_reminder || '08:00');
      setNightReminder(settings.night_reminder || '21:00');
      setWaterGoal(settings.water_goal);
      setEmailReminders(settings.email_reminders);
      setPushRemindersEnabled(settings.push_reminders_enabled);
      setHasInitialized(true);
    }
  }, [settings, hasInitialized]);

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
        push_reminders_enabled: pushRemindersEnabled,
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
      // 1. Automatically trigger a pre-delete backup download so they don't accidentally lose anything
      const { data: entries } = await supabase
        .from('daily_entries')
        .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*), medications(*)')
        .eq('user_id', user.id);

      const backupData = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        entries: entries || []
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `daylight_planner_pre_delete_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      // 2. Clear local browser offline cache
      localStorage.removeItem('daylight_offline_cache');

      // 3. Delete all database data
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

        <div className="pt-2 border-t border-border/40 dark:border-dark-border/40 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={pushRemindersEnabled}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (checked) {
                  if (!user) return;
                  const granted = await requestOneSignalPushPermission(user.id);
                  if (granted) {
                    setPushRemindersEnabled(true);
                  } else {
                    alert('Push notification permission was denied. Please enable notifications in your browser settings.');
                    setPushRemindersEnabled(false);
                  }
                } else {
                  setPushRemindersEnabled(false);
                  disableOneSignalPush();
                }
              }}
            />
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <Bell size={14} /> Enable push notifications
            </span>
          </label>
          <p className="text-xs text-text-muted dark:text-dark-text-muted pl-7">
            Push reminders are delivered directly to your device (desktop or mobile) and require browser notification permission. Ensure you are using a supported browser.
          </p>
        </div>
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

      {/* Backup and Export */}
      <section className="card space-y-4">
        <h2 className="section-title text-text-primary dark:text-dark-text">
          <Download size={18} className="text-lavender" />
          Backup & Export Data
        </h2>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
          Your Daylight Planner database is safe! Supabase operates on robust storage with automatic daily backups. 
          Additionally, you can download copy backups of your data below to keep them locally, or restore a backup.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {/* JSON Export */}
          <button
            type="button"
            className="btn-secondary py-3 flex items-center justify-center gap-2 font-semibold"
            onClick={handleExportJSON}
            disabled={backingUp}
          >
            <Download size={16} />
            {backingUp ? 'Exporting...' : 'Download JSON Backup'}
          </button>

          {/* PDF Journal Digest */}
          <button
            type="button"
            className="btn-secondary py-3 flex items-center justify-center gap-2 font-semibold"
            onClick={handlePrintDigest}
          >
            <FileText size={16} />
            Generate PDF/Print Journal
          </button>
        </div>

        {/* JSON Import/Restore */}
        <div className="pt-4 border-t border-border dark:border-dark-border">
          <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
            <Upload size={14} className="text-lavender" />
            Restore data from JSON Backup
          </label>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".json"
              className="text-xs text-text-muted cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-lavender-light file:text-lavender-dark hover:file:bg-lavender/30 dark:file:bg-dark-surface-raised dark:file:text-lavender"
              onChange={handleImportJSON}
              disabled={restoring}
            />
            {restoring && <Loader2 size={16} className="animate-spin text-lavender" />}
            {restoreSuccess && <span className="text-xs text-emerald-500 font-semibold">Done!</span>}
          </div>
        </div>
      </section>

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
