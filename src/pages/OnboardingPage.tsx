import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserSettings } from '../hooks/useUserSettings';
import { usePersonalisation } from '../hooks/usePersonalisation';
import { useAuthStore } from '../stores/auth-store';
import { getAllTimezones } from '../lib/utils';
import {
  Sun, Globe, Clock, Droplets, Bell, ArrowRight, Loader2, Sparkles, Compass, Target, Smile
} from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush } from '../lib/push';
import {
  LIFE_STAGE_OPTIONS,
  FOCUS_OPTIONS,
  SUPPORT_STYLE_OPTIONS,
} from '../types/database';

const timezones = getAllTimezones();

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { completeOnboarding } = useUserSettings();
  const { updatePersonalisation } = usePersonalisation();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tzSearch, setTzSearch] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const [morningReminder, setMorningReminder] = useState('08:00');
  const [nightReminder, setNightReminder] = useState('21:00');
  const [waterGoal, setWaterGoal] = useState(8);
  const [pushRemindersEnabled, setPushRemindersEnabled] = useState(false);

  // Optional personalisation
  const [lifeStage, setLifeStage] = useState<string | null>(null);
  const [currentFocus, setCurrentFocus] = useState<string | null>(null);
  const [supportStyle, setSupportStyle] = useState<'gentle' | 'cheerful' | 'direct' | 'playful'>('gentle');

  const filteredTz = tzSearch
    ? timezones.filter((tz) => tz.label.toLowerCase().includes(tzSearch.toLowerCase()))
    : timezones;

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        completeOnboarding({
          display_name: displayName || null,
          timezone,
          morning_reminder: morningReminder,
          night_reminder: nightReminder,
          water_goal: waterGoal,
          push_reminders_enabled: pushRemindersEnabled,
        }),
        updatePersonalisation({
          life_stage: lifeStage,
          current_focus: currentFocus,
          support_style: supportStyle,
          personalisation_enabled: true,
          trivia_enabled: true,
        }),
      ]);
      navigate('/app', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  const steps = [
    // Step 0: Welcome + name
    <div key="name" className="space-y-6 fade-in">
      <div className="text-center">
        <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-xl ring-4 ring-lavender/40 flex items-center justify-center mx-auto mb-4">
          <img src="/mewwmory-icon.png" alt="Mewwmory" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight">Welcome to Mewwmory! 🐾</h2>
        <p className="text-text-secondary dark:text-dark-text-secondary mt-2">
          Let's set up your planner in just a few steps.
        </p>
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1.5">What should we call you?</label>
        <input
          type="text"
          className="input-field"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoFocus
        />
      </div>
    </div>,

    // Step 1: Timezone
    <div key="tz" className="space-y-6 fade-in">
      <div className="flex items-center gap-3">
        <Globe size={24} className="text-lavender" />
        <h2 className="text-xl font-bold">Your Timezone</h2>
      </div>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
        We'll use this to show the correct date for your entries.
      </p>
      <div className="relative">
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
            {filteredTz.length === 0 && (
              <div className="tz-dropdown-item text-text-muted">No matching timezones</div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-text-muted">
        Currently selected: <strong>{timezones.find((t) => t.value === timezone)?.label || timezone}</strong>
      </p>
    </div>,

    // Step 2: Reminder times
    <div key="reminders" className="space-y-6 fade-in">
      <div className="flex items-center gap-3">
        <Clock size={24} className="text-peach" />
        <h2 className="text-xl font-bold">Daily Routine</h2>
      </div>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
        When do you typically start and end your day?
      </p>
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
    </div>,

    // Step 3: Water goal & Notifications
    <div key="water" className="space-y-6 fade-in">
      <div className="flex items-center gap-3">
        <Droplets size={24} className="text-lavender" />
        <h2 className="text-xl font-bold">Hydration & Habits</h2>
      </div>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
        Set your daily water target. You can adjust this anytime in Settings.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="water-btn"
          onClick={() => setWaterGoal(Math.max(1, waterGoal - 1))}
        >−</button>
        <span className="text-3xl font-extrabold w-12 text-center text-text-primary dark:text-dark-text">
          {waterGoal}
        </span>
        <button
          type="button"
          className="water-btn"
          onClick={() => setWaterGoal(waterGoal + 1)}
        >+</button>
        <span className="text-sm text-text-muted">glasses / day</span>
      </div>

      <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface/80 dark:bg-dark-surface border border-border/60 cursor-pointer">
        <input
          type="checkbox"
          className="toggle"
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
        <div>
          <span className="text-sm font-semibold flex items-center gap-1.5">
            <Bell size={14} />
            Push notifications
          </span>
          <p className="text-xs text-text-muted dark:text-dark-text-muted">
            Receive morning check-in and night reflection reminders directly on this device
          </p>
        </div>
      </label>
    </div>,

    // Step 4: Optional Personalisation
    <div key="persona" className="space-y-5 fade-in">
      <div className="flex items-center gap-3">
        <Sparkles size={24} className="text-lavender animate-pulse" />
        <div>
          <h2 className="text-xl font-bold">Make Mewd feel like you 🌸</h2>
          <p className="text-xs text-text-muted">Optional • Tailors language and examples to your journey</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
          <Compass size={12} className="text-lavender" />
          Current Path / Stage
        </label>
        <div className="flex flex-wrap gap-1.5">
          {LIFE_STAGE_OPTIONS.map((st) => (
            <button
              key={st}
              type="button"
              className={`text-xs font-medium px-2.5 py-1.5 rounded-xl border transition-all ${
                lifeStage === st
                  ? 'bg-lavender text-white border-lavender font-bold shadow-xs'
                  : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 hover:border-lavender/40'
              }`}
              onClick={() => setLifeStage(lifeStage === st ? null : st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
          <Target size={12} className="text-lavender" />
          Primary Focus
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_OPTIONS.slice(0, 5).map((fc) => (
            <button
              key={fc}
              type="button"
              className={`text-xs font-medium px-2.5 py-1.5 rounded-xl border transition-all ${
                currentFocus === fc
                  ? 'bg-lavender text-white border-lavender font-bold shadow-xs'
                  : 'bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border-border/40 hover:border-lavender/40'
              }`}
              onClick={() => setCurrentFocus(currentFocus === fc ? null : fc)}
            >
              {fc}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
          <Smile size={12} className="text-lavender" />
          Companion Tone
        </label>
        <div className="grid grid-cols-2 gap-2">
          {SUPPORT_STYLE_OPTIONS.map((sty) => (
            <button
              key={sty.id}
              type="button"
              className={`text-left p-2.5 rounded-xl border transition-all ${
                supportStyle === sty.id
                  ? 'bg-lavender/10 dark:bg-lavender/20 border-lavender font-bold shadow-xs'
                  : 'bg-surface dark:bg-dark-surface border-border/40 hover:border-lavender/40'
              }`}
              onClick={() => setSupportStyle(sty.id as any)}
            >
              <div className="text-xs font-bold text-text-primary dark:text-dark-text">{sty.label}</div>
              <div className="text-[10px] text-text-muted dark:text-dark-text-muted">{sty.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>,
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-dark-bg px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-8 bg-lavender' : 'w-2 bg-cream-darker dark:bg-dark-border'
              }`}
            />
          ))}
        </div>

        <div className="card shadow-xl">
          {steps[step]}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mt-4">
              {error}
            </p>
          )}

          <div className="flex justify-between mt-8">
            {step > 0 ? (
              <button className="btn-ghost text-xs" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : <div />}

            {isLastStep ? (
              <button
                className="btn-primary text-xs font-bold"
                onClick={handleFinish}
                disabled={saving}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Get Started'}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="btn-primary text-xs font-bold" onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
