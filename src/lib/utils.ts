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

export interface TimezoneOption {
  value: string;
  label: string;
}

function formatTimezoneName(tz: string): string {
  const customMap: Record<string, string> = {
    'UTC': 'UTC / Coordinated Universal Time',
    'Asia/Kolkata': 'India / Kolkata',
    'Asia/Calcutta': 'India / Kolkata',
    'America/New_York': 'USA / New York',
    'America/Chicago': 'USA / Chicago',
    'America/Denver': 'USA / Denver',
    'America/Los_Angeles': 'USA / Los Angeles',
    'America/Phoenix': 'USA / Phoenix',
    'America/Anchorage': 'USA / Anchorage',
    'Pacific/Honolulu': 'USA / Honolulu',
    'Europe/Madrid': 'Spain / Madrid',
    'Europe/London': 'United Kingdom / London',
    'Europe/Paris': 'France / Paris',
    'Europe/Berlin': 'Germany / Berlin',
    'Europe/Rome': 'Italy / Rome',
    'Europe/Athens': 'Greece / Athens',
    'Europe/Vienna': 'Austria / Vienna',
    'Europe/Stockholm': 'Sweden / Stockholm',
    'Europe/Zurich': 'Switzerland / Zurich',
    'Europe/Amsterdam': 'Netherlands / Amsterdam',
    'Europe/Brussels': 'Belgium / Brussels',
    'Europe/Dublin': 'Ireland / Dublin',
    'Europe/Lisbon': 'Portugal / Lisbon',
    'Europe/Copenhagen': 'Denmark / Copenhagen',
    'Europe/Helsinki': 'Finland / Helsinki',
    'Europe/Oslo': 'Norway / Oslo',
    'Europe/Prague': 'Czech Republic / Prague',
    'Europe/Budapest': 'Hungary / Budapest',
    'Europe/Warsaw': 'Poland / Warsaw',
    'Europe/Istanbul': 'Turkey / Istanbul',
    'Europe/Moscow': 'Russia / Moscow',
    'Asia/Tokyo': 'Japan / Tokyo',
    'Asia/Shanghai': 'China / Shanghai',
    'Asia/Singapore': 'Singapore',
    'Asia/Dubai': 'UAE / Dubai',
    'Asia/Seoul': 'South Korea / Seoul',
    'Asia/Bangkok': 'Thailand / Bangkok',
    'Asia/Jakarta': 'Indonesia / Jakarta',
    'Asia/Manila': 'Philippines / Manila',
    'Asia/Hong_Kong': 'Hong Kong',
    'Asia/Taipei': 'Taiwan / Taipei',
    'Asia/Kuala_Lumpur': 'Malaysia / Kuala Lumpur',
    'Australia/Sydney': 'Australia / Sydney',
    'Australia/Melbourne': 'Australia / Melbourne',
    'Australia/Brisbane': 'Australia / Brisbane',
    'Australia/Adelaide': 'Australia / Adelaide',
    'Australia/Perth': 'Australia / Perth',
    'Pacific/Auckland': 'New Zealand / Auckland',
    'America/Toronto': 'Canada / Toronto',
    'America/Vancouver': 'Canada / Vancouver',
    'America/Montreal': 'Canada / Montreal',
    'America/Mexico_City': 'Mexico / Mexico City',
    'America/Sao_Paulo': 'Brazil / Sao Paulo',
    'America/Argentina/Buenos_Aires': 'Argentina / Buenos Aires',
    'America/Bogota': 'Colombia / Bogota',
    'America/Lima': 'Peru / Lima',
    'America/Santiago': 'Chile / Santiago',
    'Africa/Johannesburg': 'South Africa / Johannesburg',
    'Africa/Cairo': 'Egypt / Cairo',
    'Africa/Nairobi': 'Kenya / Nairobi',
    'Africa/Lagos': 'Nigeria / Lagos',
    'Asia/Riyadh': 'Saudi Arabia / Riyadh',
    'Asia/Jerusalem': 'Israel / Jerusalem',
    'Asia/Kathmandu': 'Nepal / Kathmandu',
    'Asia/Dhaka': 'Bangladesh / Dhaka',
    'Asia/Karachi': 'Pakistan / Karachi',
    'Asia/Colombo': 'Sri Lanka / Colombo',
  };

  if (customMap[tz]) {
    return customMap[tz];
  }

  const parts = tz.split('/');
  if (parts.length === 2) {
    const continent = parts[0].replace('_', ' ');
    const city = parts[1].replace('_', ' ');
    return `${city} (${continent})`;
  } else if (parts.length === 3) {
    const continent = parts[0].replace('_', ' ');
    const region = parts[1].replace('_', ' ');
    const city = parts[2].replace('_', ' ');
    return `${city}, ${region} (${continent})`;
  }
  return tz.replace('_', ' ');
}

/** Get all IANA timezones with friendly formatting and offsets */
export function getAllTimezones(): TimezoneOption[] {
  let list: string[] = [];
  try {
    list = (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    list = [
      'UTC',
      'Asia/Kolkata',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Madrid',
      'Europe/Moscow',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Dubai',
      'Asia/Seoul',
      'Australia/Sydney',
      'Pacific/Auckland',
      'America/Toronto',
      'America/Vancouver',
      'America/Mexico_City',
      'America/Sao_Paulo',
      'Africa/Johannesburg',
      'Africa/Cairo',
      'Asia/Kathmandu',
    ];
  }

  const uniqueZones = Array.from(new Set(list));

  const options: TimezoneOption[] = uniqueZones.map((tz) => {
    let offsetString = '';
    try {
      const d = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset',
      }).formatToParts(d);
      const part = parts.find((p) => p.type === 'timeZoneName');
      offsetString = part ? part.value : '';
    } catch {
      // Fallback
    }

    const friendlyName = formatTimezoneName(tz);
    const label = offsetString ? `${friendlyName} (${offsetString})` : friendlyName;

    return {
      value: tz,
      label,
    };
  });

  return options.sort((a, b) => a.label.localeCompare(b.label));
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

  // At least 1 priority required (not all 3)
  if (!priorities.some((p: any) => p?.text && p.text.trim())) return false;

  // At least 1 action step required (not all 5)
  if (!actionSteps.some((a: any) => a?.text && a.text.trim())) return false;

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
  // At least 1 gratitude entry required (not all 3)
  if (!fields?.night_gratitude_1?.trim() && !fields?.night_gratitude_2?.trim() && !fields?.night_gratitude_3?.trim()) return false;
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
