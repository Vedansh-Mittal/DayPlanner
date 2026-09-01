import React from 'react';
import { MoodSelector } from './MoodSelector';
import { FluidWaterTracker } from './FluidWaterTracker';
import { HabitRingTarget } from './HabitRingTarget';
import { TactileCheckbox } from './TactileCheckbox';
import {
  MEAL_TYPES, WIND_DOWN_TYPES,
  type DailyEntry, type Medication, type Meal, type WindDownItem,
} from '../types/database';
import { getSavedMedicationList } from '../hooks/useDailyEntry';
import {
  Moon, Pill, UtensilsCrossed, Heart, Trophy,
  ThumbsUp, Lightbulb, Brain, Star, Plus, Trash2, Shield, Sparkles,
} from 'lucide-react';

interface NightPlannerProps {
  entry: DailyEntry | null;
  medications: Medication[];
  meals: Meal[];
  windDownItems: WindDownItem[];
  waterGoal: number;
  updateField: (field: keyof DailyEntry, value: any) => void;
  updateMedication: (id: string, field: keyof Medication, value: any) => void;
  addMedication: (initial?: Partial<Medication>) => void;
  removeMedication: (id: string) => void;
  updateMeal: (mealType: string, field: keyof Meal, value: any) => void;
  updateWindDown: (itemType: string, completed: boolean) => void;
  flushSave: () => void;
  disabled?: boolean;
  lockedReason?: string;
}

export const NightPlanner: React.FC<NightPlannerProps> = ({
  entry, medications, meals, windDownItems, waterGoal,
  updateField, updateMedication, addMedication, removeMedication,
  updateMeal, updateWindDown, flushSave,
  disabled = false, lockedReason,
}) => {
  const waterCount = entry?.water_count || 0;

  const isStarted = !!(
    entry?.night_mood ||
    entry?.night_gratitude_1?.trim() ||
    entry?.night_gratitude_2?.trim() ||
    entry?.night_gratitude_3?.trim() ||
    entry?.night_win?.trim() ||
    entry?.night_went_well?.trim() ||
    entry?.night_improve?.trim() ||
    entry?.night_brain_dump?.trim() ||
    entry?.night_intention?.trim() ||
    meals.some((m) => m.ate || m.time || m.notes) ||
    windDownItems.some((w) => w.completed) ||
    waterCount > 0
  );

  const moodMissing = isStarted && (!entry?.night_mood || !entry?.night_mood_intensity);
  const mealsMissing = isStarted && (
    waterCount <= 0 ||
    meals.length < 4 ||
    meals.some((m) => {
      const isEaten = m.ate === true && m.time && m.time !== 'skipped' && m.time.trim().length > 0;
      const isSkipped = m.time === 'skipped' || (m.ate === false && m.time === 'skipped');
      return !isEaten && !isSkipped;
    })
  );
  const gratitudeMissing = isStarted && (!entry?.night_gratitude_1?.trim() && !entry?.night_gratitude_2?.trim() && !entry?.night_gratitude_3?.trim());
  const winMissing = isStarted && !entry?.night_win?.trim();
  const wentWellMissing = isStarted && !entry?.night_went_well?.trim();
  const improveMissing = isStarted && !entry?.night_improve?.trim();
  const brainDumpMissing = isStarted && !entry?.night_brain_dump?.trim();
  const intentionMissing = isStarted && !entry?.night_intention?.trim();
  const windDownMissing = isStarted && !windDownItems.some((w) => w.completed);

  return (
    <div className="space-y-6 fade-in">
      {disabled && (
        <div className="bg-lavender-light dark:bg-lavender-dark/20 border border-lavender text-lavender-dark dark:text-lavender px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-semibold">
          <span className="text-base">🔒</span>
          <span>{lockedReason || 'Night Planner is locked.'}</span>
        </div>
      )}
      <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60 disabled:pointer-events-none">
      {/* Mood reflection */}
      <section className={`card transition-all ${moodMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Moon size={18} className="text-lavender" />
          Mood Reflection
          {moodMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <MoodSelector
          selectedMood={entry?.night_mood || null}
          intensity={entry?.night_mood_intensity || null}
          onMoodChange={(mood) => updateField('night_mood', mood)}
          onIntensityChange={(i) => updateField('night_mood_intensity', i)}
          label="How am I feeling tonight?"
        />
      </section>

      {/* Medication tracker */}
      <section className="card">
        <h3 className="section-title">
          <Pill size={18} className="text-pink-soft" />
          Medication Tracker
          <span className="text-xs font-normal text-text-muted dark:text-dark-text-muted ml-auto">Optional</span>
        </h3>
        <div className="flex items-center gap-1 mb-3 text-xs text-text-muted dark:text-dark-text-muted">
          <Shield size={12} />
          <span>This section is private and only visible to you.</span>
        </div>

        {medications.length > 0 && (
          <div className="space-y-3 mb-3">
            {/* Header - Desktop only */}
            <div className="hidden md:grid md:grid-cols-[1fr_100px_95px_56px_36px] gap-2.5 text-xs font-bold text-text-muted dark:text-dark-text-muted px-1 items-center">
              <span>Medication</span>
              <span>Dose</span>
              <span>Time</span>
              <span className="text-center">Taken</span>
              <span></span>
            </div>

            {medications.map((med) => (
              <div 
                key={med.id} 
                className="p-3 md:p-0 bg-cream/30 dark:bg-dark-bg/20 md:bg-transparent dark:md:bg-transparent rounded-2xl md:rounded-none border border-border/40 dark:border-dark-border/40 md:border-0 flex flex-col md:grid md:grid-cols-[1fr_100px_95px_56px_36px] gap-2.5 items-stretch md:items-center"
              >
                {/* Col 1: Name */}
                <div className="flex-1">
                  <span className="text-[11px] font-bold text-text-muted md:hidden block mb-1">Medication</span>
                  <input
                    type="text"
                    className="input-field text-sm w-full"
                    placeholder="e.g., Vitamin D, Aspirin"
                    value={med.name || ''}
                    onChange={(e) => updateMedication(med.id, 'name', e.target.value)}
                    onBlur={flushSave}
                    disabled={disabled}
                  />
                </div>

                {/* Mobile Bottom Row / Desktop Cols 2, 3, 4, 5 */}
                <div className="flex items-center gap-2 md:contents">
                  {/* Col 2: Dose */}
                  <div className="flex-1 md:w-auto">
                    <span className="text-[11px] font-bold text-text-muted md:hidden block mb-1">Dose</span>
                    <input
                      type="text"
                      className="input-field text-xs md:text-sm w-full"
                      placeholder="e.g., 1000 IU"
                      value={med.dose || ''}
                      onChange={(e) => updateMedication(med.id, 'dose', e.target.value)}
                      onBlur={flushSave}
                      disabled={disabled}
                    />
                  </div>

                  {/* Col 3: Time */}
                  <div className="w-[85px] md:w-auto shrink-0">
                    <span className="text-[11px] font-bold text-text-muted md:hidden block mb-1">Time</span>
                    <input
                      type="time"
                      className="input-field text-xs md:text-sm px-2 w-full"
                      value={med.time || ''}
                      onChange={(e) => updateMedication(med.id, 'time', e.target.value)}
                      onBlur={flushSave}
                      disabled={disabled}
                    />
                  </div>

                  {/* Col 4: Taken Checkbox */}
                  <div className="flex flex-col items-center justify-center shrink-0 md:w-full">
                    <span className="text-[11px] font-bold text-text-muted md:hidden block mb-1">Taken</span>
                    <div className="flex items-center justify-center h-[38px]">
                      <TactileCheckbox
                        checked={med.taken}
                        onChange={(checked) => updateMedication(med.id, 'taken', checked)}
                        disabled={disabled}
                        ariaLabel={`${med.name || 'Medication'} taken`}
                      />
                    </div>
                  </div>

                  {/* Col 5: Trash */}
                  <div className="flex items-center justify-center shrink-0 md:w-auto">
                    <span className="text-[11px] md:hidden block mb-1 opacity-0">.</span>
                    <button
                      type="button"
                      className="text-text-muted hover:text-red-500 transition-colors p-2 h-[38px] flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => removeMedication(med.id)}
                      disabled={disabled}
                      aria-label="Remove medication"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => addMedication()}
            disabled={disabled}
          >
            <Plus size={16} />
            Add medication
          </button>
        </div>

        {/* Quick Add from Saved Medications */}
        {(() => {
          const savedList = getSavedMedicationList();
          const activeNames = new Set(medications.map((m) => (m.name || '').trim().toLowerCase()));
          const available = savedList.filter((sm) => sm.name && !activeNames.has(sm.name.toLowerCase()));
          if (available.length === 0) return null;

          return (
            <div className="mt-3 pt-3 border-t border-border/40 dark:border-dark-border/40">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted dark:text-dark-text-muted uppercase tracking-wider mb-2">
                <Sparkles size={13} className="text-lavender-dark dark:text-lavender" />
                <span>Saved Medications (Click to Quick Add)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {available.map((sm) => (
                  <button
                    key={sm.name}
                    type="button"
                    className="text-xs px-3 py-1 rounded-full bg-lavender/15 hover:bg-lavender/25 dark:bg-dark-card text-text-primary dark:text-dark-text border border-lavender/30 hover:border-lavender flex items-center gap-1.5 transition-all tap-spring shadow-xs"
                    onClick={() => addMedication({ name: sm.name, dose: sm.dose || '', time: sm.time || '', taken: false })}
                    disabled={disabled}
                    title="Click to add to today's tracker"
                  >
                    <Plus size={12} className="text-lavender-dark dark:text-lavender" />
                    <span className="font-semibold">{sm.name}</span>
                    {sm.dose && <span className="opacity-70 text-[10px]">({sm.dose})</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Side effects / notes */}
        <div className="mt-4">
          <label className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary">
            Side Effects / Notes
          </label>
          <textarea
            className="input-field mt-1 min-h-[60px] resize-y"
            placeholder="Any side effects or notes about meds…"
            value={entry?.medication_notes || ''}
            onChange={(e) => updateField('medication_notes', e.target.value)}
            onBlur={flushSave}
          />
        </div>
      </section>

      {/* Meals & Hydration */}
      <section className={`card transition-all ${mealsMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <UtensilsCrossed size={18} className="text-peach" />
          Meals & Hydration
          {mealsMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>

        {/* Meals */}
        <div className="space-y-3 mb-6">
          {/* Header - Desktop only */}
          <div className="hidden md:grid md:grid-cols-[auto_100px_160px_110px_1fr] gap-2 text-xs font-bold text-text-muted dark:text-dark-text-muted px-1 items-center">
            <span></span>
            <span>Meal</span>
            <span>Ate?</span>
            <span>Time</span>
            <span>Notes</span>
          </div>
          {MEAL_TYPES.map((mt) => {
            const meal = meals.find((m) => m.meal_type === mt.value);
            const isEaten = !!(meal?.ate && meal?.time && meal.time !== 'skipped');
            const isSkipped = meal?.time === 'skipped';

            return (
              <div 
                key={mt.value} 
                className="flex flex-col md:grid md:grid-cols-[auto_100px_160px_110px_1fr] gap-2 p-3 md:p-0 bg-cream/30 dark:bg-dark-bg/20 md:bg-transparent dark:md:bg-transparent rounded-xl md:rounded-none border border-border/40 dark:border-dark-border/40 md:border-0 items-stretch md:items-center"
              >
                {/* Mobile top row: Emoji + Label + Toggles */}
                <div className="flex items-center justify-between w-full md:contents">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{mt.emoji}</span>
                    <span className="text-sm font-semibold">{mt.label}</span>
                  </div>
                  
                  {/* Eat/Skip Toggle Buttons (visible on right side of header on mobile, inline on desktop) */}
                  <div className="flex gap-1.5 md:contents">
                    <button
                      type="button"
                      title="Ate meal"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 border ${
                        isEaten
                          ? 'bg-mint text-emerald-950 border-mint font-bold shadow-sm'
                          : 'bg-surface dark:bg-dark-surface border-border dark:border-dark-border text-text-muted hover:text-text-primary'
                      }`}
                      onClick={() => {
                        const prevTime = meal?.time && meal.time !== 'skipped' ? meal.time : '12:00';
                        updateMeal(mt.value, 'ate', true);
                        updateMeal(mt.value, 'time', prevTime);
                      }}
                    >
                      ✓ Ate
                    </button>

                    <button
                      type="button"
                      title="Skipped meal"
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 border ${
                        isSkipped
                          ? 'bg-rose-500 text-white border-rose-500 font-bold shadow-sm'
                          : 'bg-surface dark:bg-dark-surface border-border dark:border-dark-border text-text-muted hover:text-text-primary'
                      }`}
                      onClick={() => {
                        updateMeal(mt.value, 'ate', false);
                        updateMeal(mt.value, 'time', 'skipped');
                      }}
                    >
                      ✗ Skipped
                    </button>
                  </div>
                </div>

                {/* Time & Notes Fields: inline on desktop, side-by-side row below header on mobile */}
                <div className="flex flex-row md:contents gap-2 mt-1 md:mt-0 items-center">
                  {/* Time picker */}
                  <div className="w-[100px] md:w-auto shrink-0">
                    {isSkipped ? (
                      <span className="block text-xs font-medium text-text-muted italic px-2 py-1 bg-cream-dark dark:bg-dark-surface-raised rounded-lg text-center border border-border/30 dark:border-dark-border/30">
                        Skipped
                      </span>
                    ) : (
                      <input
                        type="time"
                        className="input-field text-xs py-1.5 md:text-sm w-full"
                        value={meal?.time && meal.time !== 'skipped' ? meal.time : ''}
                        onChange={(e) => {
                          const tVal = e.target.value;
                          if (tVal) {
                            updateMeal(mt.value, 'ate', true);
                            updateMeal(mt.value, 'time', tVal);
                          } else {
                            updateMeal(mt.value, 'ate', false);
                            updateMeal(mt.value, 'time', '');
                          }
                        }}
                        onBlur={flushSave}
                      />
                    )}
                  </div>

                  {/* Notes */}
                  <input
                    type="text"
                    className="input-field text-xs py-1.5 md:text-sm flex-1 md:w-auto"
                    placeholder="Notes"
                    value={meal?.notes || ''}
                    onChange={(e) => updateMeal(mt.value, 'notes', e.target.value)}
                    onBlur={flushSave}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Water Tracker Flagship (§3) */}
        <div className="pt-4 border-t border-border/50 dark:border-dark-border/50">
          <FluidWaterTracker
            waterCount={waterCount}
            waterGoal={waterGoal}
            dateStr={entry?.entry_date || ''}
            onWaterChange={(val) => {
              updateField('water_count', val);
              flushSave();
            }}
            disabled={disabled}
          />
        </div>
      </section>

      {/* Gratitude */}
      <section className={`card transition-all ${gratitudeMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Heart size={18} className="text-pink-soft" />
          Today I Am Grateful For
          {gratitudeMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
          3 things I'm grateful for today:
        </p>
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <span className="text-sm font-bold text-text-muted w-5">{n}.</span>
              <input
                type="text"
                className="input-field flex-1"
                placeholder={`Gratitude ${n}`}
                value={(entry as any)?.[`night_gratitude_${n}`] || ''}
                onChange={(e) => updateField(`night_gratitude_${n}` as keyof DailyEntry, e.target.value)}
                onBlur={flushSave}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Win of the day */}
      <section className={`card transition-all ${winMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Trophy size={18} className="text-yellow-soft" />
          Win of the Day
          {winMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
          No matter how small, celebrate it.
        </p>
        <input
          type="text"
          className="input-field"
          placeholder="What was my win today?"
          value={entry?.night_win || ''}
          onChange={(e) => updateField('night_win', e.target.value)}
          onBlur={flushSave}
        />
      </section>

      {/* What went well / improve */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className={`card transition-all ${wentWellMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
          <h3 className="section-title">
            <ThumbsUp size={18} className="text-mint" />
            What Went Well?
            {wentWellMissing && (
              <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
                Pending
              </span>
            )}
          </h3>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
            Moments I'm proud of:
          </p>
          <textarea
            className="input-field min-h-[80px] resize-y"
            placeholder="What went well today…"
            value={entry?.night_went_well || ''}
            onChange={(e) => updateField('night_went_well', e.target.value)}
            onBlur={flushSave}
          />
        </section>

        <section className={`card transition-all ${improveMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
          <h3 className="section-title">
            <Lightbulb size={18} className="text-peach" />
            What Can I Improve?
            {improveMissing && (
              <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
                Pending
              </span>
            )}
          </h3>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
            One thing I can do better:
          </p>
          <textarea
            className="input-field min-h-[80px] resize-y"
            placeholder="What can I improve tomorrow…"
            value={entry?.night_improve || ''}
            onChange={(e) => updateField('night_improve', e.target.value)}
            onBlur={flushSave}
          />
        </section>
      </div>

      {/* Night brain dump */}
      <section className={`card transition-all ${brainDumpMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Brain size={18} className="text-lavender" />
          Brain Dump
          {brainDumpMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
          Any worries, thoughts, or random stuff.
        </p>
        <textarea
          className="input-field min-h-[100px] resize-y"
          placeholder="Get it all out…"
          value={entry?.night_brain_dump || ''}
          onChange={(e) => updateField('night_brain_dump', e.target.value)}
          onBlur={flushSave}
        />
      </section>

      {/* Tomorrow I will */}
      <section className={`card transition-all ${intentionMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Star size={18} className="text-yellow-soft" />
          Tomorrow I Will…
          {intentionMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
          One intention for tomorrow:
        </p>
        <input
          type="text"
          className="input-field"
          placeholder="Tomorrow I will…"
          value={entry?.night_intention || ''}
          onChange={(e) => updateField('night_intention', e.target.value)}
          onBlur={flushSave}
        />
      </section>

      {/* Wind-down checklist */}
      <section className={`card transition-all ${windDownMissing ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-200/50 dark:ring-amber-900/30' : ''}`}>
        <h3 className="section-title">
          <Moon size={18} className="text-blue-soft" />
          Time to Unwind
          {windDownMissing && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full ml-auto">
              Pending
            </span>
          )}
        </h3>
        {/* Habit Rings for Wind-down (§6) */}
        <div className="flex flex-wrap gap-3.5 justify-center pt-1">
          {WIND_DOWN_TYPES.map((wd) => {
            const item = windDownItems.find((w) => w.item_type === wd.value);
            return (
              <HabitRingTarget
                key={wd.value}
                label={wd.label}
                emoji={wd.emoji}
                completed={item?.completed || false}
                onToggle={() => updateWindDown(wd.value, !item?.completed)}
                disabled={disabled}
              />
            );
          })}
        </div>
      </section>

      {/* Remember */}
      <div className="text-center py-4 text-sm text-text-muted dark:text-dark-text-muted">
        ❤️ You did your best today. Rest is productive too. 🌙
      </div>
      </fieldset>
    </div>
  );
};
