import { format, parse, isValid } from 'date-fns';

/** Format a date string (YYYY-MM-DD) to a friendly display like "Sunday, August 30" */
export function formatFriendlyDate(dateStr: string): string {
  const d = parse(dateStr, 'yyyy-MM-dd', new Date());
  if (!isValid(d)) return dateStr;
  return format(d, 'EEEE, MMMM d');
}

/** Get today's date as YYYY-MM-DD in user's local timezone */
export function getTodayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Clamp a number between min and max */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Simple className merger */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Debounce function */
export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return debounced;
}

/** Get all IANA timezones */
export function getAllTimezones(): string[] {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    // Fallback for older browsers
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Asia/Dubai',
      'Australia/Sydney',
      'Pacific/Auckland',
    ];
  }
}

/** Truncate text with ellipsis */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/** Extract a snippet around a search match */
export function extractSnippet(text: string, query: string, contextLen = 40): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return truncate(text, contextLen * 2);
  const start = Math.max(0, idx - contextLen);
  const end = Math.min(text.length, idx + query.length + contextLen);
  let snippet = '';
  if (start > 0) snippet += '…';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '…';
  return snippet;
}

/** Strict 100% Morning completion check (every field required) */
export function isMorningComplete(fields: any, priorities: any[] = [], actionSteps: any[] = []): boolean {
  if (!fields?.morning_mood) return false;
  if (!fields?.morning_mood_intensity) return false;
  if (!Array.isArray(fields?.morning_motivations) || fields.morning_motivations.length === 0) return false;
  if (fields.morning_motivations.includes('Other') && !fields?.morning_motivation_other?.trim()) return false;
  if (!fields?.morning_why?.trim()) return false;
  if (!fields?.morning_brain_dump?.trim()) return false;
  if (!fields?.morning_inspire?.trim()) return false;

  // All 3 priorities required
  if (priorities.length < 3) return false;
  for (let i = 0; i < 3; i++) {
    if (!priorities[i]?.text || !priorities[i].text.trim()) return false;
  }

  // All 5 action steps required
  if (actionSteps.length < 5) return false;
  for (let i = 0; i < 5; i++) {
    if (!actionSteps[i]?.text || !actionSteps[i].text.trim()) return false;
  }

  return true;
}

/** Check if Morning has been started */
export function isMorningStarted(fields: any, priorities: any[] = [], actionSteps: any[] = []): boolean {
  return !!(
    fields?.morning_mood ||
    fields?.morning_why?.trim() ||
    fields?.morning_brain_dump?.trim() ||
    fields?.morning_inspire?.trim() ||
    (Array.isArray(fields?.morning_motivations) && fields.morning_motivations.length > 0) ||
    priorities.some((p: any) => p?.text && p.text.trim().length > 0) ||
    actionSteps.some((a: any) => a?.text && a.text.trim().length > 0)
  );
}

/** Strict 100% Night completion check (every field required except medications) */
export function isNightComplete(fields: any, meals: any[] = [], windDownItems: any[] = []): boolean {
  if (!fields?.night_mood) return false;
  if (!fields?.night_mood_intensity) return false;
  if (!fields?.night_gratitude_1?.trim()) return false;
  if (!fields?.night_gratitude_2?.trim()) return false;
  if (!fields?.night_gratitude_3?.trim()) return false;
  if (!fields?.night_win?.trim()) return false;
  if (!fields?.night_went_well?.trim()) return false;
  if (!fields?.night_improve?.trim()) return false;
  if (!fields?.night_brain_dump?.trim()) return false;
  if (!fields?.night_intention?.trim()) return false;
  if ((fields?.water_count || 0) <= 0) return false;

  // All 4 meals required AND must be answered (either Ate with valid time, or Skipped)
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'];
  for (const mt of mealTypes) {
    const meal = meals.find((m: any) => m.meal_type === mt);
    if (!meal) return false;
    const isEaten = meal.ate === true && meal.time && meal.time !== 'skipped' && meal.time.trim().length > 0;
    const isSkipped = meal.time === 'skipped' || (meal.ate === false && meal.time === 'skipped');
    if (!isEaten && !isSkipped) return false;
  }

  // Wind-down items: at least 1 completed
  if (!windDownItems.some((w: any) => w.completed)) return false;

  return true;
}

/** Check if Night has been started */
export function isNightStarted(fields: any, meals: any[] = [], windDownItems: any[] = []): boolean {
  return !!(
    fields?.night_mood ||
    fields?.night_gratitude_1?.trim() ||
    fields?.night_gratitude_2?.trim() ||
    fields?.night_gratitude_3?.trim() ||
    fields?.night_win?.trim() ||
    fields?.night_went_well?.trim() ||
    fields?.night_improve?.trim() ||
    fields?.night_brain_dump?.trim() ||
    fields?.night_intention?.trim() ||
    meals.some((m: any) => m.ate || m.time || m.notes) ||
    windDownItems.some((w: any) => w.completed) ||
    (fields?.water_count || 0) > 0
  );
}
