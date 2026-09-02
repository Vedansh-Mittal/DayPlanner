import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserSettings } from '../hooks/useUserSettings';
import { usePersonalisation } from '../hooks/usePersonalisation';
import { useAuthStore } from '../stores/auth-store';
import { useThemeStore, type ThemePreference } from '../stores/theme-store';
import { supabase } from '../lib/supabase';
import { getAllTimezones } from '../lib/utils';
import {
  Settings as SettingsIcon, User, Globe, Clock, Droplets, Bell,
  Palette, LogOut, Trash2, Loader2, Check, Sun, Moon, Monitor,
  Download, Upload, FileText, Sparkles, Compass, Target, Lightbulb, Smile, BookOpen, Briefcase
} from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush } from '../lib/push';
import {
  LIFE_STAGE_OPTIONS,
  CAREER_FIELD_OPTIONS,
  FOCUS_OPTIONS,
  INTEREST_OPTIONS,
  SUPPORT_STYLE_OPTIONS,
} from '../types/database';

const timezones = getAllTimezones();

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, loading: settingsLoading } = useUserSettings();
  const { personalisation, updatePersonalisation, loading: personaLoading } = usePersonalisation();
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

  // Personalisation states (Multi-select)
  const [lifeStages, setLifeStages] = useState<string[]>([]);
  const [careerFields, setCareerFields] = useState<string[]>([]);
  const [customField, setCustomField] = useState<string>('');
  const [currentFocuses, setCurrentFocuses] = useState<string[]>([]);
  const [customFocus, setCustomFocus] = useState<string>('');
  const [interests, setInterests] = useState<string[]>([]);
  const [supportStyles, setSupportStyles] = useState<('gentle' | 'cheerful' | 'direct' | 'playful')[]>(['gentle']);
  const [personalisationEnabled, setPersonalisationEnabled] = useState<boolean>(true);
  const [triviaEnabled, setTriviaEnabled] = useState<boolean>(true);

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

            const { error: entryErr } = await supabase.from('daily_entries').upsert(entryRow);
            if (entryErr) throw entryErr;

            // 2. Restore child relation rows
            if (Array.isArray(priorities) && priorities.length > 0) {
              const { error: err } = await supabase.from('priorities').upsert(
                priorities.map((p: any) => ({ ...p, daily_entry_id: entryId, user_id: user.id }))
              );
              if (err) throw err;
            }
            if (Array.isArray(action_steps) && action_steps.length > 0) {
              const { error: err } = await supabase.from('action_steps').upsert(
                action_steps.map((a: any) => ({ ...a, daily_entry_id: entryId, user_id: user.id }))
              );
              if (err) throw err;
            }
            if (Array.isArray(meals) && meals.length > 0) {
              const { error: err } = await supabase.from('meals').upsert(
                meals.map((m: any) => ({ ...m, daily_entry_id: entryId, user_id: user.id }))
              );
              if (err) throw err;
            }
            if (Array.isArray(wind_down_items) && wind_down_items.length > 0) {
              const { error: err } = await supabase.from('wind_down_items').upsert(
                wind_down_items.map((w: any) => ({ ...w, daily_entry_id: entryId, user_id: user.id }))
              );
              if (err) throw err;
            }
            if (Array.isArray(medications) && medications.length > 0) {
              const { error: err } = await supabase.from('medications').upsert(
                medications.map((med: any) => ({ ...med, daily_entry_id: entryId, user_id: user.id }))
              );
              if (err) throw err;
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
          // Clear file input value to allow selecting same file again if needed
          if (e.target) e.target.value = '';
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setRestoring(false);
      if (e.target) e.target.value = '';
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
              <title>Mewwmory Journal Digest</title>
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
              <h1>Mewwmory</h1>
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

  // Sync local state when settings and personalisation load
  useEffect(() => {
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

  useEffect(() => {
    if (personalisation) {
      setLifeStages(personalisation.life_stages || []);
      
      const knownFields = CAREER_FIELD_OPTIONS as readonly string[];
      const savedFields = personalisation.career_fields || [];
      const standardFields = savedFields.filter((f) => knownFields.includes(f as any));
      const customOnes = savedFields.filter((f) => !knownFields.includes(f as any) && f !== 'Other');
      
      if (customOnes.length > 0) {
        if (!standardFields.includes('Other')) standardFields.push('Other');
        setCustomField(customOnes.join(', '));
      }
      setCareerFields(standardFields);

      const knownFocuses = FOCUS_OPTIONS as readonly string[];
      const savedFocuses = personalisation.current_focuses || [];
      const standardFocuses = savedFocuses.filter((f) => knownFocuses.includes(f as any));
      const customFocs = savedFocuses.filter((f) => !knownFocuses.includes(f as any) && f !== 'Other');

      if (customFocs.length > 0) {
        if (!standardFocuses.includes('Other')) standardFocuses.push('Other');
        setCustomFocus(customFocs.join(', '));
      }
      setCurrentFocuses(standardFocuses);

      setInterests(personalisation.interests || []);
      setSupportStyles(personalisation.support_styles?.length ? personalisation.support_styles : ['gentle']);
      setPersonalisationEnabled(personalisation.personalisation_enabled !== false);
      setTriviaEnabled(personalisation.trivia_enabled !== false);
    }
  }, [personalisation]);

  const filteredTz = tzSearch
    ? timezones.filter((tz) => tz.label.toLowerCase().includes(tzSearch.toLowerCase()))
    : timezones;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      let mergedCareerFields = careerFields.filter((f) => f !== 'Other');
      if (careerFields.includes('Other') && customField.trim()) {
        const parts = customField.split(',').map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!mergedCareerFields.includes(p)) mergedCareerFields.push(p);
        }
      }

      let mergedFocuses = currentFocuses.filter((f) => f !== 'Other');
      if (currentFocuses.includes('Other') && customFocus.trim()) {
        const parts = customFocus.split(',').map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!mergedFocuses.includes(p)) mergedFocuses.push(p);
        }
      }

      await Promise.all([
        updateSettings({
          display_name: displayName || null,
          timezone,
          morning_reminder: morningReminder,
          night_reminder: nightReminder,
          water_goal: waterGoal,
          email_reminders: emailReminders,
          push_reminders_enabled: pushRemindersEnabled,
        }),
        updatePersonalisation({
          life_stages: lifeStages,
          career_fields: mergedCareerFields,
          current_focuses: mergedFocuses,
          interests,
          support_styles: supportStyles.length ? supportStyles : ['gentle'],
          personalisation_enabled: personalisationEnabled,
          trivia_enabled: triviaEnabled,
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save error:', e);
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
            value={tzOpen ? tzSearch : (timezones.find((t) => t.value === timezone)?.label || timezone)}
            onFocus={() => { setTzOpen(true); setTzSearch(''); }}
            onChange={(e) => setTzSearch(e.target.value)}
            onBlur={() => setTimeout(() => setTzOpen(false), 200)}
          />
          {tzOpen && (
            <div className="tz-dropdown">
              {filteredTz.slice(0, 50).map((tz) => (
                <div
                  key={tz.value}
                  className={`tz-dropdown-item ${tz.value === timezone ? 'highlighted' : ''}`}
                  onMouseDown={() => {
                    setTimezone(tz.value);
                    setTzOpen(false);
                    setTzSearch('');
                  }}
                >
                  {tz.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ✨ AI Reflection & Personalisation */}
      <section className="card space-y-6 border-lavender/30 dark:border-lavender/20">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="section-title text-lavender flex items-center gap-2">
              <Sparkles size={18} className="text-lavender" />
              AI Reflection & Personalisation
            </h2>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-1">
              Help Mewd understand your path and tailor encouragement to your real journey. (All fields are optional).
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-semibold text-text-muted">Enabled</span>
            <input
              type="checkbox"
              className="toggle"
              checked={personalisationEnabled}
              onChange={(e) => setPersonalisationEnabled(e.target.checked)}
            />
          </label>
        </div>

        {personalisationEnabled && (
          <div className="space-y-5 pt-1">
            {/* Current Path(s) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  <Compass size={13} className="text-lavender" />
                  Current Path / Stage
                </label>
                <span className="text-[10px] text-text-muted">Multi-select enabled</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {LIFE_STAGE_OPTIONS.map((stage) => {
                  const isSelected = lifeStages.includes(stage);
                  return (
                    <button
                      key={stage}
                      type="button"
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all tap-spring flex items-center gap-1 ${
                        isSelected
                          ? 'bg-lavender text-white border-lavender shadow-xs font-bold'
                          : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border hover:border-lavender/40'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setLifeStages(lifeStages.filter((s) => s !== stage));
                        } else {
                          setLifeStages([...lifeStages, stage]);
                        }
                      }}
                    >
                      {isSelected && <Check size={12} />}
                      <span>{stage}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Field(s) / Area(s) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  <Briefcase size={13} className="text-lavender" />
                  Field / Area of Focus
                </label>
                <span className="text-[10px] text-text-muted">Multi-select enabled</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAREER_FIELD_OPTIONS.map((field) => {
                  const isSelected = careerFields.includes(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all tap-spring flex items-center gap-1 ${
                        isSelected
                          ? 'bg-lavender text-white border-lavender shadow-xs font-bold'
                          : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border hover:border-lavender/40'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setCareerFields(careerFields.filter((f) => f !== field));
                        } else {
                          setCareerFields([...careerFields, field]);
                        }
                      }}
                    >
                      {isSelected && <Check size={12} />}
                      <span>{field}</span>
                    </button>
                  );
                })}
              </div>
              {careerFields.includes('Other') && (
                <input
                  type="text"
                  className="input-field text-xs py-2 mt-2 transition-all animate-fadeIn"
                  placeholder="Specify your field or specialization (e.g. Counselling Psychology, AI Research, Med-Tech)..."
                  value={customField}
                  onChange={(e) => setCustomField(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {/* Current Focus(es) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  <Target size={13} className="text-lavender" />
                  Primary Goals & Focus Right Now
                </label>
                <span className="text-[10px] text-text-muted">Multi-select enabled</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {FOCUS_OPTIONS.map((foc) => {
                  const isSelected = currentFocuses.includes(foc);
                  return (
                    <button
                      key={foc}
                      type="button"
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all tap-spring flex items-center gap-1 ${
                        isSelected
                          ? 'bg-lavender text-white border-lavender shadow-xs font-bold'
                          : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border hover:border-lavender/40'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setCurrentFocuses(currentFocuses.filter((f) => f !== foc));
                        } else {
                          setCurrentFocuses([...currentFocuses, foc]);
                        }
                      }}
                    >
                      {isSelected && <Check size={12} />}
                      <span>{foc}</span>
                    </button>
                  );
                })}
              </div>
              {currentFocuses.includes('Other') && (
                <input
                  type="text"
                  className="input-field text-xs py-2 mt-2 transition-all animate-fadeIn"
                  placeholder="Specify your custom goals or focus areas (comma-separated)..."
                  value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {/* Preferred Support Style(s) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  <Smile size={13} className="text-lavender" />
                  Companion Tone & Style (Select any that fit)
                </label>
                <span className="text-[10px] text-text-muted">Multi-select</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SUPPORT_STYLE_OPTIONS.map((sty) => {
                  const isSelected = supportStyles.includes(sty.id as any);
                  return (
                    <button
                      key={sty.id}
                      type="button"
                      className={`text-left p-3 rounded-2xl border transition-all tap-spring ${
                        isSelected
                          ? 'bg-lavender/10 dark:bg-lavender/20 border-lavender shadow-xs ring-2 ring-lavender/40'
                          : 'bg-surface dark:bg-dark-surface border-border/40 dark:border-dark-border hover:border-lavender/40'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          if (supportStyles.length > 1) {
                            setSupportStyles(supportStyles.filter((s) => s !== sty.id));
                          }
                        } else {
                          setSupportStyles([...supportStyles, sty.id as any]);
                        }
                      }}
                    >
                      <div className="text-xs font-bold text-text-primary dark:text-dark-text flex items-center justify-between">
                        <span>{sty.label}</span>
                        {isSelected && <Check size={14} className="text-lavender" />}
                      </div>
                      <div className="text-[11px] text-text-muted dark:text-dark-text-muted mt-0.5">
                        {sty.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tiny Sparks & Interests */}
            <div className="pt-3 border-t border-border/40 dark:border-dark-border/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-text-primary dark:text-dark-text flex items-center gap-1.5">
                    <Lightbulb size={13} className="text-amber-500" />
                    Include "Tiny Sparks" (Sourced Science & Trivia)
                  </label>
                  <p className="text-[11px] text-text-muted dark:text-dark-text-muted">
                    Adds a short, fascinating sourced fact or psychological principle at the end of reflections.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={triviaEnabled}
                  onChange={(e) => setTriviaEnabled(e.target.checked)}
                />
              </div>

              {triviaEnabled && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-2">
                    Pick your favorite spark topics:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {INTEREST_OPTIONS.map((item) => {
                      const isSelected = interests.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-all tap-spring flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-lavender text-white border-lavender shadow-xs font-bold'
                              : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 dark:border-dark-border hover:border-lavender/40'
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setInterests(interests.filter((id) => id !== item.id));
                            } else {
                              setInterests([...interests, item.id]);
                            }
                          }}
                        >
                          <span>{item.emoji}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={pushRemindersEnabled}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (checked) {
                  if (!user) return;
                  const granted = await subscribeToPush(user.id);
                  if (granted) {
                    setPushRemindersEnabled(true);
                  } else {
                    setPushRemindersEnabled(false);
                  }
                } else {
                  if (user) {
                    await unsubscribeFromPush(user.id);
                  }
                  setPushRemindersEnabled(false);
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
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${themePref === t.value
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
          Your Mewwmory database is safe! Supabase operates on robust storage with automatic daily backups.
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
              accept=".json,application/json,text/plain,application/octet-stream"
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
          A JSON file will be downloaded automatically before deletion, so in case you want to restore this progress again in future.
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
