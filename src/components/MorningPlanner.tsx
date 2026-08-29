import React from 'react';
import { MoodSelector } from './MoodSelector';
import { MOTIVATION_OPTIONS } from '../types/database';
import type { DailyEntry, Priority, ActionStep } from '../types/database';
import { Sparkles, Target, Zap, Brain, Star } from 'lucide-react';

interface MorningPlannerProps {
  entry: DailyEntry | null;
  priorities: Priority[];
  actionSteps: ActionStep[];
  updateField: (field: keyof DailyEntry, value: any) => void;
  updatePriority: (index: number, field: keyof Priority, value: any) => void;
  updateActionStep: (index: number, field: keyof ActionStep, value: any) => void;
  flushSave: () => void;
  disabled?: boolean;
}

export const MorningPlanner: React.FC<MorningPlannerProps> = ({
  entry, priorities, actionSteps,
  updateField, updatePriority, updateActionStep, flushSave, disabled = false,
}) => {
  const motivations: string[] = entry?.morning_motivations || [];

  const toggleMotivation = (m: string) => {
    const current = [...motivations];
    const idx = current.indexOf(m);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(m);
    }
    updateField('morning_motivations', current);
  };

  const isStarted = !!(
    entry?.morning_mood ||
    entry?.morning_why ||
    entry?.morning_brain_dump ||
    entry?.morning_inspire ||
    priorities.some((p) => p.text?.trim()) ||
    actionSteps.some((a) => a.text?.trim())
  );

  const moodMissing = isStarted && (!entry?.morning_mood || !entry?.morning_mood_intensity);
  const whyMissing = isStarted && (!entry?.morning_why?.trim() || !motivations.length || (motivations.includes('Other') && !entry?.morning_motivation_other?.trim()));
  const priorityMissing = isStarted && (priorities.length < 3 || priorities.some((p) => !p.text?.trim()));
  const actionMissing = isStarted && (actionSteps.length < 5 || actionSteps.some((a) => !a.text?.trim()));
  const brainDumpMissing = isStarted && !entry?.morning_brain_dump?.trim();
  const inspireMissing = isStarted && !entry?.morning_inspire?.trim();

  return (
    <fieldset disabled={disabled} className="space-y-6 fade-in disabled:opacity-60 disabled:pointer-events-none">
      {/* Mood check-in */}
      <section className={`card transition-all ${moodMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Sparkles size={18} className="text-yellow-soft" />
          Mood Check-in
          {moodMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <MoodSelector
          selectedMood={entry?.morning_mood || null}
          intensity={entry?.morning_mood_intensity || null}
          onMoodChange={(mood) => updateField('morning_mood', mood)}
          onIntensityChange={(i) => updateField('morning_mood_intensity', i)}
          label="How am I feeling today?"
        />
      </section>

      {/* Motivation */}
      <section className={`card transition-all ${whyMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Star size={18} className="text-lavender" />
          Motivation Tracker & WHY
          {whyMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
          What's fueling me today?
        </p>
        <div className="space-y-2">
          {MOTIVATION_OPTIONS.map((m) => (
            <label key={m} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-custom"
                checked={motivations.includes(m)}
                onChange={() => toggleMotivation(m)}
              />
              <span className="text-sm font-medium">{m}</span>
            </label>
          ))}
          {/* Other */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={motivations.includes('Other')}
              onChange={() => toggleMotivation('Other')}
            />
            <span className="text-sm font-medium">Other</span>
          </label>
          {motivations.includes('Other') && (
            <input
              type="text"
              className="input-field ml-8"
              placeholder="What else motivates you?"
              value={entry?.morning_motivation_other || ''}
              onChange={(e) => updateField('morning_motivation_other', e.target.value)}
              onBlur={flushSave}
            />
          )}
        </div>

        {/* My why today */}
        <div className="mt-4">
          <label className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
            My WHY today
          </label>
          <input
            type="text"
            className="input-field mt-1"
            placeholder="Why am I showing up today?"
            value={entry?.morning_why || ''}
            onChange={(e) => updateField('morning_why', e.target.value)}
            onBlur={flushSave}
          />
        </div>
      </section>

      {/* Priorities */}
      <section className={`card transition-all ${priorityMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Target size={18} className="text-pink-soft" />
          3 Things I Will Focus On Today
          {priorityMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
          My top priorities:
        </p>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="checkbox"
                className="checkbox-custom"
                checked={priorities[i]?.completed || false}
                onChange={(e) => updatePriority(i, 'completed', e.target.checked)}
              />
              <span className="text-sm font-bold text-text-muted w-5">{i + 1}.</span>
              <input
                type="text"
                className="input-field flex-1"
                placeholder={`Priority ${i + 1}`}
                value={priorities[i]?.text || ''}
                onChange={(e) => updatePriority(i, 'text', e.target.value)}
                onBlur={flushSave}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Action Steps */}
      <section className={`card transition-all ${actionMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Zap size={18} className="text-peach" />
          Plan of Action
          {actionMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
          What are my first steps?
        </p>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="checkbox"
                className="checkbox-custom"
                checked={actionSteps[i]?.completed || false}
                onChange={(e) => updateActionStep(i, 'completed', e.target.checked)}
              />
              <input
                type="text"
                className="input-field flex-1"
                placeholder={`Step ${i + 1}`}
                value={actionSteps[i]?.text || ''}
                onChange={(e) => updateActionStep(i, 'text', e.target.value)}
                onBlur={flushSave}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Brain Dump */}
      <section className={`card transition-all ${brainDumpMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Brain size={18} className="text-blue-soft" />
          Brain Dump
          {brainDumpMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
          Get it out of your head.
        </p>
        <textarea
          className="input-field min-h-[120px] resize-y"
          placeholder="Write anything on your mind…"
          value={entry?.morning_brain_dump || ''}
          onChange={(e) => updateField('morning_brain_dump', e.target.value)}
          onBlur={flushSave}
        />
      </section>

      {/* Inspire Me */}
      <section className={`card transition-all ${inspireMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Sparkles size={18} className="text-mint" />
          Inspire Me Today
          {inspireMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
          Something to lift me up:
        </p>
        <textarea
          className="input-field min-h-[80px] resize-y"
          placeholder="A quote, a mantra, a reminder…"
          value={entry?.morning_inspire || ''}
          onChange={(e) => updateField('morning_inspire', e.target.value)}
          onBlur={flushSave}
        />
      </section>

      {/* Remember */}
      <div className="text-center py-4 text-sm text-text-muted dark:text-dark-text-muted space-x-4">
        <span>🌈 Progress, not perfection.</span>
        <span>❤️ You are enough.</span>
        <span>⭐ You've got this!</span>
      </div>
    </fieldset>
  );
};
