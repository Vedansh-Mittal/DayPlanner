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
  Download, Upload, FileText, Sparkles, Compass, Target, Lightbulb, Smile, BookOpen, Briefcase,
  Shield, Smartphone, Share2, Lock, Eye, EyeOff, AlertCircle, X, Package, ShieldCheck, KeyRound
} from 'lucide-react';
import { useCrypto } from '../contexts/CryptoContext';
import { encryptBackupPayload, decryptBackupPayload } from '../lib/crypto';
import { usePwaInstall } from '../hooks/usePwaInstall';
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
  const { isStandalone, isIOS, canInstallPrompt, install: installPwa } = usePwaInstall();
  const [isInstallingPwa, setIsInstallingPwa] = useState(false);

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

  // Encryption (E2EE)
  const {
    isEncryptionConfigured,
    isUnlocked,
    setShowUnlockModal,
    cachedPassphrase,
    decryptDailyEntry,
    decryptPrioritiesList,
    decryptActionStepsList,
    decryptMealsList,
    decryptMedicationsList,
    encryptDailyEntry,
    encryptPrioritiesList,
    encryptActionStepsList,
    encryptMealsList,
    encryptMedicationsList,
  } = useCrypto();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  // Export Modal state (3 options: plain, encrypted, both)
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'plain' | 'encrypted' | 'both'>('both');
  const [passwordChoice, setPasswordChoice] = useState<'current' | 'custom'>('current');
  const [customPassword, setCustomPassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [showCustomPassword, setShowCustomPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Encrypted Import Password Modal state
  const [pendingEncryptedBackup, setPendingEncryptedBackup] = useState<any | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [importPasswordError, setImportPasswordError] = useState<string | null>(null);
  const [importingFromEncrypted, setImportingFromEncrypted] = useState(false);
  const [showSetupEncryptionPrompt, setShowSetupEncryptionPrompt] = useState(false);

  const handleExportJSON = () => {
    setShowExportModal(true);
    setExportError(null);
    setPasswordChoice(isEncryptionConfigured ? 'current' : 'custom');
    setCustomPassword('');
    setCurrentPasswordInput('');
  };

  const executeExport = async () => {
    if (!user) return;
    
    let activePassword = '';
    if (exportFormat === 'encrypted' || exportFormat === 'both') {
      if (isEncryptionConfigured && passwordChoice === 'current') {
        activePassword = cachedPassphrase || currentPasswordInput.trim();
        if (!activePassword) {
          setExportError('Please enter your current journal password.');
          return;
        }
      } else {
        activePassword = customPassword.trim();
        if (activePassword.length < 8) {
          setExportError('Password must be at least 8 characters long.');
          return;
        }
      }
    }

    setBackingUp(true);
    setExportError(null);
    try {
      const { data: entries } = await supabase
        .from('daily_entries')
        .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*), medications(*)')
        .eq('user_id', user.id);

      // Decrypt in browser RAM so the user's exported backup is readable and clear
      const decryptedEntries = await Promise.all(
        (entries || []).map(async (entry: any) => {
          const dec = await decryptDailyEntry(entry);
          const decP = await decryptPrioritiesList(entry.priorities || []);
          const decA = await decryptActionStepsList(entry.action_steps || []);
          const decM = await decryptMealsList(entry.meals || []);
          const decMeds = await decryptMedicationsList(entry.medications || []);
          return {
            ...dec,
            priorities: decP,
            action_steps: decA,
            meals: decM,
            medications: decMeds,
          };
        })
      );

      const backupData = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        entries: decryptedEntries,
      };

      const dateStr = new Date().toISOString().split('T')[0];

      const triggerDownload = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };

      if (exportFormat === 'plain' || exportFormat === 'both') {
        triggerDownload(
          JSON.stringify(backupData, null, 2),
          `mewwmory_backup_${dateStr}_plaintext.json`
        );
      }

      if (exportFormat === 'encrypted' || exportFormat === 'both') {
        const encryptedPayload = await encryptBackupPayload(backupData, activePassword);
        triggerDownload(
          JSON.stringify(encryptedPayload, null, 2),
          `mewwmory_backup_${dateStr}_encrypted.json`
        );
      }

      setShowExportModal(false);
      setCustomPassword('');
      setCurrentPasswordInput('');
    } catch (err: any) {
      console.error('Export error:', err);
      setExportError(err?.message || 'Export failed. Please try again.');
    } finally {
      setBackingUp(false);
    }
  };

  const performRestore = async (backup: any) => {
    if (!user) return;
    if (!backup || !Array.isArray(backup.entries)) {
      throw new Error('Invalid backup file structure. No entries found.');
    }

    setRestoring(true);
    setRestoreSuccess(false);

    try {
      for (const entry of backup.entries) {
        const entryId = entry.id;

        // 1. Upsert daily entry row (remove nested arrays first)
        const { priorities, action_steps, meals, wind_down_items, medications, ...entryRow } = entry;
        entryRow.user_id = user.id;

        const encryptedRow = await encryptDailyEntry(entryRow);
        const { error: entryErr } = await supabase.from('daily_entries').upsert(encryptedRow);
        if (entryErr) throw entryErr;

        // 2. Restore child relation rows
        if (Array.isArray(priorities) && priorities.length > 0) {
          const encP = await encryptPrioritiesList(priorities);
          const { error: err } = await supabase.from('priorities').upsert(
            encP.map((p: any) => ({ ...p, daily_entry_id: entryId, user_id: user.id }))
          );
          if (err) throw err;
        }
        if (Array.isArray(action_steps) && action_steps.length > 0) {
          const encA = await encryptActionStepsList(action_steps);
          const { error: err } = await supabase.from('action_steps').upsert(
            encA.map((a: any) => ({ ...a, daily_entry_id: entryId, user_id: user.id }))
          );
          if (err) throw err;
        }
        if (Array.isArray(meals) && meals.length > 0) {
          const encM = await encryptMealsList(meals);
          const { error: err } = await supabase.from('meals').upsert(
            encM.map((m: any) => ({ ...m, daily_entry_id: entryId, user_id: user.id }))
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
          const encMeds = await encryptMedicationsList(medications);
          const { error: err } = await supabase.from('medications').upsert(
            encMeds.map((med: any) => ({ ...med, daily_entry_id: entryId, user_id: user.id }))
          );
          if (err) throw err;
        }
      }

      setRestoreSuccess(true);
      setTimeout(() => setRestoreSuccess(false), 4000);
      alert('Backup restored successfully!');
    } finally {
      setRestoring(false);
    }
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        alert('Invalid JSON file. Please check the file format.');
        if (e.target) e.target.value = '';
        return;
      }

      // If the journal is configured but locked, prompt to unlock first so entries can be encrypted
      if (isEncryptionConfigured && !isUnlocked) {
        setShowUnlockModal(true);
        alert('Please unlock your journal with your master password first to restore your entries.');
        return;
      }

      // Check if this is an encrypted backup container
      if (parsed.daylight_backup_encrypted || parsed.format === 'daylight-encrypted-backup-v1') {
        if (!isEncryptionConfigured) {
          setShowSetupEncryptionPrompt(true);
          return;
        }

        setPendingEncryptedBackup(parsed);
        setImportPassword('');
        setImportPasswordError(null);
      } else {
        // Plain text backup: restore directly with no password
        await performRestore(parsed);
      }
    } catch (err: any) {
      console.error('Import error:', err);
      alert(err?.message || 'Error parsing or restoring backup data.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleUnlockAndRestoreEncrypted = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedBackup || !importPassword.trim()) return;

    setImportingFromEncrypted(true);
    setImportPasswordError(null);
    try {
      const decryptedData = await decryptBackupPayload(pendingEncryptedBackup, importPassword);
      await performRestore(decryptedData);
      setPendingEncryptedBackup(null);
      setImportPassword('');
    } catch (err: any) {
      setImportPasswordError(err?.message || 'Incorrect password. Could not decrypt backup file.');
    } finally {
      setImportingFromEncrypted(false);
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

      // Decrypt all entries for human-readable print/PDF output
      const decryptedEntries = await Promise.all(
        (entries || []).map(async (entry: any) => {
          const dec = await decryptDailyEntry(entry);
          const decP = await decryptPrioritiesList(entry.priorities || []);
          const decA = await decryptActionStepsList(entry.action_steps || []);
          const decM = await decryptMealsList(entry.meals || []);
          const decMeds = await decryptMedicationsList(entry.medications || []);
          return {
            ...dec,
            priorities: decP,
            action_steps: decA,
            meals: decM,
            medications: decMeds,
          };
        })
      );

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
              ${decryptedEntries.map(e => {
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

      // Decrypt entries so the user's emergency backup is clean, readable plain text JSON
      const decryptedEntries = await Promise.all(
        (entries || []).map(async (entry: any) => {
          const dec = await decryptDailyEntry(entry);
          const decP = await decryptPrioritiesList(entry.priorities || []);
          const decA = await decryptActionStepsList(entry.action_steps || []);
          const decM = await decryptMealsList(entry.meals || []);
          const decMeds = await decryptMedicationsList(entry.medications || []);
          return {
            ...dec,
            priorities: decP,
            action_steps: decA,
            meals: decM,
            medications: decMeds,
          };
        })
      );

      const backupData = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        entries: decryptedEntries,
      };

      const dateStr = new Date().toISOString().split('T')[0];
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `mewwmory_pre_delete_backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

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

          {isIOS && !isStandalone && (
            <div className="ml-7 mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Smartphone size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="font-bold">iPhone / iPad Requirement:</span> Apple requires you to install Daylight to your Home Screen first (Safari → Share <Share2 size={12} className="inline mx-0.5 text-blue-500" /> → <strong>Add to Home Screen</strong>) before iOS permits push notifications.
              </div>
            </div>
          )}
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

      {/* Security & Encryption Link */}
      <section className="card p-5 border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-surface dark:to-dark-surface flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary dark:text-dark-text">
              Security & Privacy (E2EE)
            </h2>
            <p className="text-xs text-text-muted dark:text-dark-text-muted">
              {isEncryptionConfigured ? 'Journal encryption is Active 🔒' : 'Protect your journal with Zero-Knowledge encryption'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/app/security')}
          className="btn-secondary py-2 px-3.5 text-xs font-semibold"
        >
          Manage Security →
        </button>
      </section>

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

      {/* 1. Export Options Modal (Plain, Encrypted, Both) */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-card-bg dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl p-6 shadow-2xl space-y-5">
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                setShowExportModal(false);
                setExportError(null);
                setCustomPassword('');
                setCurrentPasswordInput('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface dark:hover:bg-dark-surface transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-lavender/10 text-lavender-dark dark:text-lavender flex items-center justify-center font-bold shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary dark:text-dark-text">
                  Export Journal Backup
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  Choose your preferred backup format
                </p>
              </div>
            </div>

            {/* 3 Options */}
            <div className="space-y-2.5">
              {/* Option 1: Plain Text */}
              <button
                type="button"
                onClick={() => setExportFormat('plain')}
                className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start justify-between gap-3 ${
                  exportFormat === 'plain'
                    ? 'border-lavender bg-lavender/5 dark:bg-lavender/10'
                    : 'border-border dark:border-dark-border hover:border-lavender/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <FileText className={`w-5 h-5 mt-0.5 shrink-0 ${exportFormat === 'plain' ? 'text-lavender' : 'text-text-muted'}`} />
                  <div>
                    <div className="text-sm font-bold text-text-primary dark:text-dark-text">
                      Plain Text JSON
                    </div>
                    <div className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Human-readable in any text editor. Does not require a password to restore.
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-surface-muted dark:bg-dark-surface-muted text-text-muted shrink-0">
                  Open Format
                </span>
              </button>

              {/* Option 2: Encrypted */}
              <button
                type="button"
                onClick={() => setExportFormat('encrypted')}
                className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start justify-between gap-3 ${
                  exportFormat === 'encrypted'
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10'
                    : 'border-border dark:border-dark-border hover:border-amber-500/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Lock className={`w-5 h-5 mt-0.5 shrink-0 ${exportFormat === 'encrypted' ? 'text-amber-500' : 'text-text-muted'}`} />
                  <div>
                    <div className="text-sm font-bold text-text-primary dark:text-dark-text">
                      Encrypted JSON
                    </div>
                    <div className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Scrambled with AES-256. Strictly requires your password to open or restore.
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  Max Security
                </span>
              </button>

              {/* Option 3: Both */}
              <button
                type="button"
                onClick={() => setExportFormat('both')}
                className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start justify-between gap-3 ${
                  exportFormat === 'both'
                    ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10'
                    : 'border-border dark:border-dark-border hover:border-emerald-500/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Package className={`w-5 h-5 mt-0.5 shrink-0 ${exportFormat === 'both' ? 'text-emerald-500' : 'text-text-muted'}`} />
                  <div>
                    <div className="text-sm font-bold text-text-primary dark:text-dark-text">
                      Both Formats (Plain + Encrypted)
                    </div>
                    <div className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Downloads both files so you have an unencrypted copy and a secured vault copy.
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  Recommended
                </span>
              </button>
            </div>

            {/* Password input for Encrypted / Both options */}
            {(exportFormat === 'encrypted' || exportFormat === 'both') && (
              <div className="p-3.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border/60 dark:border-dark-border/60 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-text-primary dark:text-dark-text">
                    Password for Encrypted Backup:
                  </label>
                  {isEncryptionConfigured && (
                    <div className="inline-flex rounded-lg bg-surface dark:bg-dark-surface p-0.5 border border-border dark:border-dark-border text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setPasswordChoice('current')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          passwordChoice === 'current'
                            ? 'bg-lavender text-white font-bold shadow-xs'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        Use Current Password
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasswordChoice('custom')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          passwordChoice === 'custom'
                            ? 'bg-lavender text-white font-bold shadow-xs'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        Set New Password
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub-view: Use Current Password */}
                {isEncryptionConfigured && passwordChoice === 'current' ? (
                  cachedPassphrase ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="font-bold">Using Current Journal Password</div>
                        <div className="text-[11px] opacity-80 mt-0.5">
                          Your backup will be encrypted with the same password you use to unlock your notes.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPasswordInput}
                          onChange={(e) => setCurrentPasswordInput(e.target.value)}
                          placeholder="Confirm your current journal password"
                          className="w-full px-3.5 py-2 pr-10 rounded-lg bg-surface dark:bg-dark-surface border border-border dark:border-dark-border text-xs text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-2 text-text-muted hover:text-text-primary"
                        >
                          {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-text-muted dark:text-dark-text-muted">
                        Enter your active journal password to lock this backup copy.
                      </p>
                    </div>
                  )
                ) : (
                  /* Sub-view: Set New Password */
                  <div className="space-y-1.5">
                    <div className="relative">
                      <input
                        type={showCustomPassword ? 'text' : 'password'}
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="Enter a new password for this backup (min. 8 characters)"
                        className="w-full px-3.5 py-2 pr-10 rounded-lg bg-surface dark:bg-dark-surface border border-border dark:border-dark-border text-xs text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCustomPassword(!showCustomPassword)}
                        className="absolute right-3 top-2 text-text-muted hover:text-text-primary"
                      >
                        {showCustomPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-text-muted dark:text-dark-text-muted">
                      ⚠️ Anyone restoring this encrypted file will strictly need this new password.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error Banner */}
            {exportError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowExportModal(false);
                  setExportError(null);
                  setCustomPassword('');
                  setCurrentPasswordInput('');
                }}
                className="btn-ghost flex-1 py-2.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeExport}
                disabled={
                  backingUp ||
                  ((exportFormat === 'encrypted' || exportFormat === 'both') &&
                    (passwordChoice === 'current' && isEncryptionConfigured
                      ? !cachedPassphrase && !currentPasswordInput.trim()
                      : !customPassword.trim()))
                }
                className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {backingUp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing Backup...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Backup</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Password Prompt Modal for Encrypted Backup Restore */}
      {pendingEncryptedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card-bg dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl p-6 shadow-2xl space-y-4">
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                setPendingEncryptedBackup(null);
                setImportPassword('');
                setImportPasswordError(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface dark:hover:bg-dark-surface transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary dark:text-dark-text">
                  Unlock Encrypted Backup
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  Protected with AES-256 Encryption
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed">
              This backup file is encrypted. Enter the password that was set when this backup was created to decrypt and restore your journal into this account.
            </p>

            <form onSubmit={handleUnlockAndRestoreEncrypted} className="space-y-4">
              <div className="relative">
                <input
                  type={showImportPassword ? 'text' : 'password'}
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  placeholder="Enter backup password"
                  autoFocus
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-xs text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowImportPassword(!showImportPassword)}
                  className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
                >
                  {showImportPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Error */}
              {importPasswordError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importPasswordError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingEncryptedBackup(null);
                    setImportPassword('');
                    setImportPasswordError(null);
                  }}
                  className="btn-ghost flex-1 py-2.5 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importingFromEncrypted || !importPassword.trim()}
                  className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {importingFromEncrypted ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Decrypting & Restoring...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Decrypt & Restore</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Prompting to Setup Encryption First */}
      {showSetupEncryptionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-card-bg dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl p-6 shadow-2xl space-y-4">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowSetupEncryptionPrompt(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface dark:hover:bg-dark-surface transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary dark:text-dark-text">
                  Enable Encryption First
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  Encrypted Backup Detected
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed">
              This backup file is protected with client-side Zero-Knowledge encryption. To keep your restored journal private and encrypted in this account, please enable encryption in Security settings first.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSetupEncryptionPrompt(false)}
                className="btn-ghost flex-1 py-2.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSetupEncryptionPrompt(false);
                  navigate('/app/security');
                }}
                className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                <KeyRound className="w-4 h-4" />
                <span>Go to Security</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
