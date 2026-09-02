import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format, addDays, subDays, parse, isValid } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useDailyEntry } from '../hooks/useDailyEntry';
import { useUserSettings } from '../hooks/useUserSettings';
import { SaveStatusIndicator } from '../components/SaveStatus';
import { MorningPlanner } from '../components/MorningPlanner';
import { NightPlanner } from '../components/NightPlanner';
import { useMoodBackground } from '../hooks/useMoodBackground';
import { formatFriendlyDate, getTodayStr, isMorningComplete, isMorningStarted, isNightComplete, isNightStarted } from '../lib/utils';
import { ChevronLeft, ChevronRight, CalendarDays, Sun, Moon, StickyNote, RotateCcw, Trash2, AlertTriangle, X } from 'lucide-react';

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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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
    addMedication, removeMedication, clearAllMedications, updateMedication,
    clearEntireDay,
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

  // Touch swipe gesture strictly scoped to Morning <-> Night tab content (§phone convenience)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTabTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      // Ignore edge swipes (within 30px of screen edge) to preserve native OS back/forward navigation
      if (touch.clientX < 30 || touch.clientX > window.innerWidth - 30) {
        touchStartRef.current = null;
        return;
      }
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    }
  };

  const handleTabTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const duration = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Must be a quick, intentful horizontal swipe (< 500ms duration, > 60px horizontal distance, 2x horizontal dominance)
    if (duration < 500 && Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 2.0) {
      if (deltaX < 0 && activeTab === 'morning') {
        // Swiped Right to Left (finger moved left): Switch from Morning to Night
        setActiveTab('night');
      } else if (deltaX > 0 && activeTab === 'night') {
        // Swiped Left to Right (finger moved right): Switch from Night to Morning
        setActiveTab('morning');
      }
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

      {/* Scoped Tab Content (Swipable on mobile) */}
      <div
        className="touch-pan-y"
        onTouchStart={handleTabTouchStart}
        onTouchEnd={handleTabTouchEnd}
      >
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
            clearAllMedications={clearAllMedications}
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

      {/* Clear Day Action */}
      {!isFuture && (
        <div className="flex justify-center pt-2 pb-8">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-red-500 font-medium px-3.5 py-2 rounded-2xl hover:bg-red-50/80 dark:hover:bg-red-950/20 transition-all border border-border/40 hover:border-red-200 dark:border-dark-border/40 shadow-xs"
            onClick={() => setShowResetConfirm(true)}
            title="Reset and clear all logs for this day"
          >
            <RotateCcw size={13} />
            <span>Reset & clear this day</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div 
            className="bg-white dark:bg-dark-surface border border-border/80 dark:border-dark-border rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-scale-up"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">
                  Reset this day?
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  {formatFriendlyDate(dateStr)}
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary dark:text-dark-text-muted leading-relaxed">
              This will permanently delete all morning intentions, priorities, action steps, meal records, and medication logs for this day.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost flex-1 text-xs py-2.5"
                onClick={() => setShowResetConfirm(false)}
                disabled={isClearing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2.5 px-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                onClick={async () => {
                  setIsClearing(true);
                  await clearEntireDay();
                  setIsClearing(false);
                  setShowResetConfirm(false);
                }}
                disabled={isClearing}
              >
                <Trash2 size={14} />
                <span>{isClearing ? 'Clearing...' : 'Clear Day'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
