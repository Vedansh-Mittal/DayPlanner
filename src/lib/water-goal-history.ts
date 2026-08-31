import { format } from 'date-fns';

const LOCAL_STORAGE_KEY = 'daylight_water_goal_history';

/**
 * Returns the recorded water goal history object:
 * e.g. { "2020-01-01": 8, "2026-08-31": 9 }
 */
export function getWaterGoalHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading water goal history:', e);
  }
  return { '2020-01-01': 8 };
}

/**
 * Record a new water goal effective from a specific dateStr (defaults to today).
 */
export function setWaterGoalForDate(newGoal: number, dateStr?: string) {
  const effectiveDate = dateStr || format(new Date(), 'yyyy-MM-dd');
  const history = getWaterGoalHistory();
  history[effectiveDate] = newGoal;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving water goal history:', e);
  }
}

/**
 * Get the effective water goal active on a given date.
 * Finds the latest recorded goal whose effective date is <= dateStr.
 */
export function getWaterGoalForDate(dateStr: string, fallbackGoal: number = 8): number {
  const history = getWaterGoalHistory();
  const dates = Object.keys(history).sort();

  let effectiveGoal: number | null = null;
  for (const d of dates) {
    if (d <= dateStr) {
      effectiveGoal = history[d];
    } else {
      break;
    }
  }

  return effectiveGoal !== null ? effectiveGoal : fallbackGoal;
}
