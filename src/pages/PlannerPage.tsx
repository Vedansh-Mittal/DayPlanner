import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { format, addDays, subDays, parse, isValid } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useDailyEntry } from '../hooks/useDailyEntry';
import { useUserSettings } from '../hooks/useUserSettings';
import { SaveStatusIndicator } from '../components/SaveStatus';
import { MorningPlanner } from '../components/MorningPlanner';
import { NightPlanner } from '../components/NightPlanner';
import { useMoodBackground } from '../hooks/useMoodBackground';
import { formatFriendlyDate, getTodayStr, isMorningComplete, isMorningStarted, isNightComplete, isNightStarted } from '../lib/utils';
import { ChevronLeft, ChevronRight, CalendarDays, Sun, Moon, StickyNote } from 'lucide-react';

import { getWaterGoalForDate } from '../lib/water-goal-history';

/** Parse and validate a date string from the URL, falling back to today */
function getInitialDate(param: string | null): string {
  if (param) {
    const d = parse(param, 'yyyy-MM-dd', new Date());
    if (isValid(d)) return param;
  }
  return getTodayStr();
}

export const PlannerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const [dateStr, setDateStr] = useState(() => getInitialDate(dateParam));
  const [activeTab, setActiveTab] = useState<'morning' | 'night'>('morning');
  const { settings } = useUserSettings();
  const waterGoal = getWaterGoalForDate(dateStr, settings?.water_goal || 8);

  // Keep dateStr in sync if URL param changes externally (e.g. browser back/forward)
  useEffect(() => {
    const urlDate = getInitialDate(dateParam);
    if (urlDate !== dateStr) {
      setDateStr(urlDate);
    }
  }, [dateParam]);

  const {
    entry, priorities, actionSteps, medications, meals, windDownItems,
    loading, saveStatus, error,
    updateField, updatePriority, updateActionStep,
    updateMeal, updateWindDown,
    addMedication, removeMedication, updateMedication,
    flushSave,
  } = useDailyEntry(dateStr);

  const goToDate = useCallback((offset: number) => {
    flushSave();
    const d = parse(dateStr, 'yyyy-MM-dd', new Date());
    const newDate = offset > 0 ? addDays(d, offset) : subDays(d, Math.abs(offset));
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    setDateStr(newDateStr);
    setSearchParams({ date: newDateStr }, { replace: true });
  }, [dateStr, setSearchParams, flushSave]);

  const todayStr = getTodayStr();
  const isToday = dateStr === todayStr;
  const isFuture = dateStr > todayStr;

  // Apply subtle ambient mood mesh gradient (§4)
  useMoodBackground(entry?.morning_mood || entry?.night_mood);

  // Lock night planner before 6 PM (18:00) on today
  const currentHour = new Date().getHours();
  const isNightLockedToday = isToday && currentHour < 18;

  // Dynamic completion status (strict 100% field requirement except medications)
  const morningStatus = useMemo(() => {
    if (!entry) return 'not-started';
    if (isMorningComplete(entry, priorities, actionSteps)) return 'complete';
    if (isMorningStarted(entry, priorities, actionSteps)) return 'in-progress';
    return 'not-started';
  }, [entry, priorities, actionSteps]);

  const nightStatus = useMemo(() => {
    if (!entry) return 'not-started';
    if (isNightComplete(entry, meals, windDownItems)) return 'complete';
    if (isNightStarted(entry, meals, windDownItems)) return 'in-progress';
    return 'not-started';
  }, [entry, meals, windDownItems]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <span className="text-xs font-semibold text-green-600 bg-mint-light dark:bg-mint/20 px-2 py-0.5 rounded-full">Complete</span>;
      case 'in-progress':
        return <span className="text-xs font-semibold text-yellow-700 bg-yellow-soft-light dark:bg-yellow-soft/20 px-2 py-0.5 rounded-full">In progress</span>;
      default:
        return <span className="text-xs font-semibold text-text-muted bg-cream-dark dark:bg-dark-surface-raised px-2 py-0.5 rounded-full">Not started</span>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-64 mx-auto" />
        <div className="skeleton h-6 w-48 mx-auto" />
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <button
          className="btn-ghost"
          onClick={() => goToDate(-1)}
          aria-label="Previous day"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="text-center">
          <h1 className="text-xl md:text-2xl font-extrabold text-text-primary dark:text-dark-text">
            {formatFriendlyDate(dateStr)}
          </h1>
          {!isToday && (
            <button
              className="text-xs font-semibold text-lavender hover:underline mt-1"
              onClick={() => { setDateStr(getTodayStr()); setSearchParams({}, { replace: true }); }}
            >
              <CalendarDays size={12} className="inline mr-1" />
              Jump to Today
            </button>
          )}
        </div>

        <button
          className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => goToDate(1)}
          disabled={isFuture || isToday}
          aria-label="Next day"
          title={isToday || isFuture ? 'Future dates are locked' : 'Next day'}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Future date lock warning */}
      {isFuture && (
        <div className="bg-yellow-soft-light dark:bg-yellow-soft/10 border border-yellow-soft text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-semibold">
          <span>🔒</span>
          <span>Future Date Locked. You can view or write entries for today and past dates.</span>
        </div>
      )}

      {/* Save status */}
      <div className="flex justify-center">
        <SaveStatusIndicator status={saveStatus} error={error} />
      </div>

      {/* Daily Note */}
      <section className="card">
        <h3 className="section-title">
          <StickyNote size={18} className="text-peach" />
          Daily Note
        </h3>
        <p className="text-xs text-text-muted dark:text-dark-text-muted mb-2">
          Add a small note about anything memorable today, so you can find it later.
        </p>
        <textarea
          className="input-field min-h-[60px] resize-y disabled:opacity-50"
          placeholder="What made today special?"
          value={entry?.daily_note || ''}
          onChange={(e) => updateField('daily_note', e.target.value)}
          onBlur={flushSave}
          disabled={isFuture}
        />
      </section>

      {/* Tabs */}
      <div className="flex border-b border-border dark:border-dark-border">
        <button
          className={`tab-btn flex items-center gap-2 ${activeTab === 'morning' ? 'active' : ''}`}
          onClick={() => setActiveTab('morning')}
        >
          <Sun size={16} />
          Morning
          {statusBadge(morningStatus)}
        </button>
        <button
          className={`tab-btn flex items-center gap-2 ${activeTab === 'night' ? 'active' : ''}`}
          onClick={() => setActiveTab('night')}
        >
          <Moon size={16} />
          Night
          {statusBadge(nightStatus)}
          {(isNightLockedToday || isFuture) && <span className="text-xs">🔒</span>}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'morning' ? (
        <MorningPlanner
          entry={entry}
          priorities={priorities}
          actionSteps={actionSteps}
          updateField={updateField}
          updatePriority={updatePriority}
          updateActionStep={updateActionStep}
          flushSave={flushSave}
          disabled={isFuture}
        />
      ) : (
        <NightPlanner
          entry={entry}
          medications={medications}
          meals={meals}
          windDownItems={windDownItems}
          waterGoal={waterGoal}
          updateField={updateField}
          updateMedication={updateMedication}
          addMedication={addMedication}
          removeMedication={removeMedication}
          updateMeal={updateMeal}
          updateWindDown={updateWindDown}
          flushSave={flushSave}
          disabled={isFuture || isNightLockedToday}
          lockedReason={
            isFuture
              ? 'Future dates are locked. Return on that day to log your night reflection.'
              : isNightLockedToday
              ? 'Night reflection unlocks at 6:00 PM today. Focus on your morning priorities for now!'
              : undefined
          }
        />
      )}
    </div>
  );
};
