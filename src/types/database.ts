/* ===== Database row types (match Supabase schema exactly) ===== */

export interface UserSettings {
  user_id: string;
  display_name: string | null;
  timezone: string;
  morning_reminder: string | null;
  night_reminder: string | null;
  water_goal: number;
  email_reminders: boolean;
  theme: 'light' | 'dark' | 'system';
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyEntry {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  daily_note: string | null;
  /* Morning */
  morning_mood: string | null;
  morning_mood_intensity: number | null;
  morning_motivations: string[] | null;
  morning_motivation_other: string | null;
  morning_why: string | null;
  morning_brain_dump: string | null;
  morning_inspire: string | null;
  morning_completed: boolean;
  /* Night */
  night_mood: string | null;
  night_mood_intensity: number | null;
  night_gratitude_1: string | null;
  night_gratitude_2: string | null;
  night_gratitude_3: string | null;
  night_win: string | null;
  night_went_well: string | null;
  night_improve: string | null;
  night_brain_dump: string | null;
  night_intention: string | null;
  medication_notes: string | null;
  water_count: number;
  night_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Priority {
  id: string;
  daily_entry_id: string;
  user_id: string;
  sort_order: number;
  text: string | null;
  completed: boolean;
}

export interface ActionStep {
  id: string;
  daily_entry_id: string;
  user_id: string;
  sort_order: number;
  text: string | null;
  completed: boolean;
}

export interface Medication {
  id: string;
  daily_entry_id: string;
  user_id: string;
  sort_order: number;
  name: string | null;
  dose: string | null;
  time: string | null;
  taken: boolean;
}

export interface Meal {
  id: string;
  daily_entry_id: string;
  user_id: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  ate: boolean;
  time: string | null;
  notes: string | null;
}

export interface WindDownItem {
  id: string;
  daily_entry_id: string;
  user_id: string;
  item_type: 'stretch' | 'drink_water' | 'read' | 'deep_breaths' | 'early_sleep';
  completed: boolean;
}

/* ===== Convenience / derived types ===== */

export type MoodOption =
  | 'amazing'
  | 'good'
  | 'okay'
  | 'tired'
  | 'anxious'
  | 'overwhelmed'
  | 'sad'
  | 'irritable'
  | 'meh';

export const MOOD_OPTIONS: { value: MoodOption; label: string; emoji: string }[] = [
  { value: 'amazing', label: 'Amazing', emoji: '🤩' },
  { value: 'good', label: 'Good', emoji: '😊' },
  { value: 'okay', label: 'Okay', emoji: '🙂' },
  { value: 'tired', label: 'Tired', emoji: '😴' },
  { value: 'anxious', label: 'Anxious', emoji: '😰' },
  { value: 'overwhelmed', label: 'Overwhelmed', emoji: '😵' },
  { value: 'sad', label: 'Sad', emoji: '😢' },
  { value: 'irritable', label: 'Irritable', emoji: '😤' },
  { value: 'meh', label: 'Meh', emoji: '😐' },
];

export const MOTIVATION_OPTIONS = [
  'Growth',
  'Future goals',
  'Freedom',
  'Helping others',
  'Becoming my best self',
] as const;

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '☀️' },
  { value: 'lunch', label: 'Lunch', emoji: '🌤️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snacks', label: 'Snacks', emoji: '🍪' },
];

export type WindDownType = 'stretch' | 'drink_water' | 'read' | 'deep_breaths' | 'early_sleep';

export const WIND_DOWN_TYPES: { value: WindDownType; label: string; emoji: string }[] = [
  { value: 'stretch', label: 'Stretch', emoji: '🧘' },
  { value: 'drink_water', label: 'Drink Water', emoji: '💧' },
  { value: 'read', label: 'Read', emoji: '📖' },
  { value: 'deep_breaths', label: 'Deep Breaths', emoji: '🌬️' },
  { value: 'early_sleep', label: 'Early Sleep', emoji: '🌙' },
];

export const MOOD_COLOR_MAP: Record<MoodOption, string> = {
  amazing: 'var(--color-mood-amazing)',
  good: 'var(--color-mood-good)',
  okay: 'var(--color-mood-okay)',
  tired: 'var(--color-mood-tired)',
  anxious: 'var(--color-mood-anxious)',
  overwhelmed: 'var(--color-mood-overwhelmed)',
  sad: 'var(--color-mood-sad)',
  irritable: 'var(--color-mood-irritable)',
  meh: 'var(--color-mood-meh)',
};

/** Full entry with joined child records (as returned by Supabase nested select) */
export interface DailyEntryFull extends DailyEntry {
  priorities: Priority[];
  action_steps: ActionStep[];
  medications: Medication[];
  meals: Meal[];
  wind_down_items: WindDownItem[];
}

/** Search result from the search_entries RPC */
export interface SearchResult {
  entry_id: string;
  entry_date: string;
  daily_note: string | null;
  morning_mood: string | null;
  night_mood: string | null;
  morning_completed: boolean;
  night_completed: boolean;
  matched_text: string;
  match_source: string;
}
