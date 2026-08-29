import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserSettings } from '../hooks/useUserSettings';
import { getAllTimezones } from '../lib/utils';
import { Sun, Globe, Clock, Droplets, Bell, ArrowRight, Loader2 } from 'lucide-react';

const timezones = getAllTimezones();

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { completeOnboarding } = useUserSettings();
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
  const [emailReminders, setEmailReminders] = useState(false);

  const filteredTz = tzSearch
    ? timezones.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()))
    : timezones;

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding({
        display_name: displayName || null,
        timezone,
        morning_reminder: morningReminder,
        night_reminder: nightReminder,
        water_goal: waterGoal,
        email_reminders: emailReminders,
      });
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-lavender to-blue-soft flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Sun size={32} className="text-white" />
        </div>
        <h2 className="text-2xl font-extrabold">Welcome to Daylight! ☀️</h2>
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
            {filteredTz.length === 0 && (
              <div className="tz-dropdown-item text-text-muted">No matching timezones</div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-text-muted">Currently selected: <strong>{timezone}</strong></p>
    </div>,

    // Step 2: Reminders + water
    <div key="reminders" className="space-y-6 fade-in">
      <div className="flex items-center gap-3">
        <Clock size={24} className="text-blue-soft" />
        <h2 className="text-xl font-bold">Reminders & Goals</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1.5">
            ☀️ Morning reminder
          </label>
          <input
            type="time"
            className="input-field"
            value={morningReminder}
            onChange={(e) => setMorningReminder(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5">
            🌙 Night reminder
          </label>
          <input
            type="time"
            className="input-field"
            value={nightReminder}
            onChange={(e) => setNightReminder(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-semibold mb-1.5">
          <Droplets size={16} className="text-blue-soft" />
          Daily water goal (glasses)
        </label>
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
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="checkbox-custom"
          checked={emailReminders}
          onChange={(e) => setEmailReminders(e.target.checked)}
        />
        <div>
          <span className="text-sm font-semibold flex items-center gap-1.5">
            <Bell size={14} />
            Email reminders
          </span>
          <p className="text-xs text-text-muted dark:text-dark-text-muted">
            Receive morning and night reminder emails
          </p>
        </div>
      </label>
    </div>,
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-dark-bg px-4">
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

        <div className="card">
          {steps[step]}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mt-4">
              {error}
            </p>
          )}

          <div className="flex justify-between mt-8">
            {step > 0 ? (
              <button className="btn-ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : <div />}

            {isLastStep ? (
              <button
                className="btn-primary"
                onClick={handleFinish}
                disabled={saving}
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : 'Get Started'}
                <ArrowRight size={18} />
              </button>
            ) : (
              <button className="btn-primary" onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
