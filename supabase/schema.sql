-- ============================================================
-- Daylight Planner – Supabase Schema  (IDEMPOTENT – safe to re-run)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. USER SETTINGS
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  timezone   text NOT NULL DEFAULT 'UTC',
  morning_reminder text,
  night_reminder   text,
  water_goal integer NOT NULL DEFAULT 8,
  email_reminders boolean NOT NULL DEFAULT false,
  theme      text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own settings"   ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;

CREATE POLICY "Users can view own settings"   ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON public.user_settings FOR DELETE USING (auth.uid() = user_id);


-- 2. DAILY ENTRIES
CREATE TABLE IF NOT EXISTS public.daily_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,

  daily_note text,

  morning_mood           text,
  morning_mood_intensity integer CHECK (morning_mood_intensity BETWEEN 1 AND 5),
  morning_motivations    text[],
  morning_motivation_other text,
  morning_why            text,
  morning_brain_dump     text,
  morning_inspire        text,
  morning_completed      boolean NOT NULL DEFAULT false,

  night_mood             text,
  night_mood_intensity   integer CHECK (night_mood_intensity BETWEEN 1 AND 5),
  night_gratitude_1      text,
  night_gratitude_2      text,
  night_gratitude_3      text,
  night_win              text,
  night_went_well        text,
  night_improve          text,
  night_brain_dump       text,
  night_intention        text,
  medication_notes       text,
  water_count            integer NOT NULL DEFAULT 0,
  night_completed        boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT daily_entries_user_date_unique UNIQUE (user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_entries_user_date ON public.daily_entries (user_id, entry_date);

ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own entries"   ON public.daily_entries;
DROP POLICY IF EXISTS "Users can insert own entries" ON public.daily_entries;
DROP POLICY IF EXISTS "Users can update own entries" ON public.daily_entries;
DROP POLICY IF EXISTS "Users can delete own entries" ON public.daily_entries;

CREATE POLICY "Users can view own entries"   ON public.daily_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries" ON public.daily_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries" ON public.daily_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries" ON public.daily_entries FOR DELETE USING (auth.uid() = user_id);


-- 3. PRIORITIES
CREATE TABLE IF NOT EXISTS public.priorities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_entry_id uuid NOT NULL REFERENCES public.daily_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order     integer NOT NULL,
  text           text,
  completed      boolean NOT NULL DEFAULT false,

  CONSTRAINT priorities_entry_order_unique UNIQUE (daily_entry_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_priorities_entry ON public.priorities (daily_entry_id);

ALTER TABLE public.priorities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own priorities"   ON public.priorities;
DROP POLICY IF EXISTS "Users can insert own priorities" ON public.priorities;
DROP POLICY IF EXISTS "Users can update own priorities" ON public.priorities;
DROP POLICY IF EXISTS "Users can delete own priorities" ON public.priorities;

CREATE POLICY "Users can view own priorities"   ON public.priorities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own priorities" ON public.priorities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own priorities" ON public.priorities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own priorities" ON public.priorities FOR DELETE USING (auth.uid() = user_id);


-- 4. ACTION STEPS
CREATE TABLE IF NOT EXISTS public.action_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_entry_id uuid NOT NULL REFERENCES public.daily_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order     integer NOT NULL,
  text           text,
  completed      boolean NOT NULL DEFAULT false,

  CONSTRAINT action_steps_entry_order_unique UNIQUE (daily_entry_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_action_steps_entry ON public.action_steps (daily_entry_id);

ALTER TABLE public.action_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own action_steps"   ON public.action_steps;
DROP POLICY IF EXISTS "Users can insert own action_steps" ON public.action_steps;
DROP POLICY IF EXISTS "Users can update own action_steps" ON public.action_steps;
DROP POLICY IF EXISTS "Users can delete own action_steps" ON public.action_steps;

CREATE POLICY "Users can view own action_steps"   ON public.action_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own action_steps" ON public.action_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own action_steps" ON public.action_steps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own action_steps" ON public.action_steps FOR DELETE USING (auth.uid() = user_id);


-- 5. MEDICATIONS
CREATE TABLE IF NOT EXISTS public.medications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_entry_id uuid NOT NULL REFERENCES public.daily_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order     integer NOT NULL DEFAULT 0,
  name           text,
  dose           text,
  time           text,
  taken          boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_medications_entry ON public.medications (daily_entry_id);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own medications"   ON public.medications;
DROP POLICY IF EXISTS "Users can insert own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can update own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can delete own medications" ON public.medications;

CREATE POLICY "Users can view own medications"   ON public.medications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own medications" ON public.medications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own medications" ON public.medications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own medications" ON public.medications FOR DELETE USING (auth.uid() = user_id);


-- 6. MEALS
CREATE TABLE IF NOT EXISTS public.meals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_entry_id uuid NOT NULL REFERENCES public.daily_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type      text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snacks')),
  ate            boolean NOT NULL DEFAULT false,
  time           text,
  notes          text,

  CONSTRAINT meals_entry_type_unique UNIQUE (daily_entry_id, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meals_entry ON public.meals (daily_entry_id);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own meals"   ON public.meals;
DROP POLICY IF EXISTS "Users can insert own meals" ON public.meals;
DROP POLICY IF EXISTS "Users can update own meals" ON public.meals;
DROP POLICY IF EXISTS "Users can delete own meals" ON public.meals;

CREATE POLICY "Users can view own meals"   ON public.meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meals" ON public.meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meals" ON public.meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meals" ON public.meals FOR DELETE USING (auth.uid() = user_id);


-- 7. WIND-DOWN ITEMS
CREATE TABLE IF NOT EXISTS public.wind_down_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_entry_id uuid NOT NULL REFERENCES public.daily_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type      text NOT NULL CHECK (item_type IN ('stretch','drink_water','read','deep_breaths','early_sleep')),
  completed      boolean NOT NULL DEFAULT false,

  CONSTRAINT wind_down_entry_type_unique UNIQUE (daily_entry_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_wind_down_entry ON public.wind_down_items (daily_entry_id);

ALTER TABLE public.wind_down_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wind_down"   ON public.wind_down_items;
DROP POLICY IF EXISTS "Users can insert own wind_down" ON public.wind_down_items;
DROP POLICY IF EXISTS "Users can update own wind_down" ON public.wind_down_items;
DROP POLICY IF EXISTS "Users can delete own wind_down" ON public.wind_down_items;

CREATE POLICY "Users can view own wind_down"   ON public.wind_down_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wind_down" ON public.wind_down_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wind_down" ON public.wind_down_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wind_down" ON public.wind_down_items FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 8. SEARCH FUNCTION (RPC)
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_entries(search_query text)
RETURNS TABLE (
  entry_id         uuid,
  entry_date       date,
  daily_note       text,
  morning_mood     text,
  night_mood       text,
  morning_completed boolean,
  night_completed  boolean,
  matched_text     text,
  match_source     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pattern text := '%' || search_query || '%';
BEGIN
  RETURN QUERY

  -- Search daily_entries text fields
  SELECT de.id, de.entry_date, de.daily_note, de.morning_mood, de.night_mood,
         de.morning_completed, de.night_completed,
         COALESCE(
           CASE WHEN de.daily_note ILIKE pattern THEN de.daily_note END,
           CASE WHEN de.morning_brain_dump ILIKE pattern THEN de.morning_brain_dump END,
           CASE WHEN de.night_brain_dump ILIKE pattern THEN de.night_brain_dump END,
           CASE WHEN de.morning_why ILIKE pattern THEN de.morning_why END,
           CASE WHEN de.morning_inspire ILIKE pattern THEN de.morning_inspire END,
           CASE WHEN de.night_win ILIKE pattern THEN de.night_win END,
           CASE WHEN de.night_went_well ILIKE pattern THEN de.night_went_well END,
           CASE WHEN de.night_improve ILIKE pattern THEN de.night_improve END,
           CASE WHEN de.night_intention ILIKE pattern THEN de.night_intention END,
           CASE WHEN de.night_gratitude_1 ILIKE pattern THEN de.night_gratitude_1 END,
           CASE WHEN de.night_gratitude_2 ILIKE pattern THEN de.night_gratitude_2 END,
           CASE WHEN de.night_gratitude_3 ILIKE pattern THEN de.night_gratitude_3 END,
           CASE WHEN de.medication_notes ILIKE pattern THEN de.medication_notes END
         ) AS matched_text,
         'entry'::text AS match_source
  FROM public.daily_entries de
  WHERE de.user_id = auth.uid()
    AND (
      de.daily_note ILIKE pattern
      OR de.morning_brain_dump ILIKE pattern
      OR de.night_brain_dump ILIKE pattern
      OR de.morning_why ILIKE pattern
      OR de.morning_inspire ILIKE pattern
      OR de.night_win ILIKE pattern
      OR de.night_went_well ILIKE pattern
      OR de.night_improve ILIKE pattern
      OR de.night_intention ILIKE pattern
      OR de.night_gratitude_1 ILIKE pattern
      OR de.night_gratitude_2 ILIKE pattern
      OR de.night_gratitude_3 ILIKE pattern
      OR de.medication_notes ILIKE pattern
    )

  UNION ALL

  -- Search priorities
  SELECT de.id, de.entry_date, de.daily_note, de.morning_mood, de.night_mood,
         de.morning_completed, de.night_completed,
         p.text AS matched_text,
         'priority'::text AS match_source
  FROM public.priorities p
  JOIN public.daily_entries de ON p.daily_entry_id = de.id
  WHERE p.user_id = auth.uid()
    AND p.text ILIKE pattern

  UNION ALL

  -- Search action steps
  SELECT de.id, de.entry_date, de.daily_note, de.morning_mood, de.night_mood,
         de.morning_completed, de.night_completed,
         a.text AS matched_text,
         'action step'::text AS match_source
  FROM public.action_steps a
  JOIN public.daily_entries de ON a.daily_entry_id = de.id
  WHERE a.user_id = auth.uid()
    AND a.text ILIKE pattern

  UNION ALL

  -- Search medication names
  SELECT de.id, de.entry_date, de.daily_note, de.morning_mood, de.night_mood,
         de.morning_completed, de.night_completed,
         m.name AS matched_text,
         'medication'::text AS match_source
  FROM public.medications m
  JOIN public.daily_entries de ON m.daily_entry_id = de.id
  WHERE m.user_id = auth.uid()
    AND m.name ILIKE pattern

  UNION ALL

  -- Search meal notes
  SELECT de.id, de.entry_date, de.daily_note, de.morning_mood, de.night_mood,
         de.morning_completed, de.night_completed,
         ml.notes AS matched_text,
         ('meal: ' || ml.meal_type)::text AS match_source
  FROM public.meals ml
  JOIN public.daily_entries de ON ml.daily_entry_id = de.id
  WHERE ml.user_id = auth.uid()
    AND ml.notes ILIKE pattern

  ORDER BY entry_date DESC
  LIMIT 50;
END;
$$;


-- ============================================================
-- 5. PUSH NOTIFICATION REMINDERS & SCHEDULING
-- ============================================================

-- Add push_reminders_enabled to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS push_reminders_enabled boolean NOT NULL DEFAULT false;

-- Create reminder_log table
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date     date NOT NULL,
  reminder_type  text NOT NULL CHECK (reminder_type IN ('good_morning', 'morning_reminder', 'lunch_nudge', 'night_reminder')),
  sent_at        timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error_message  text,

  CONSTRAINT reminder_log_user_date_type_unique UNIQUE (user_id, entry_date, reminder_type)
);

-- Enable RLS on reminder_log
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

-- Policies for reminder_log
DROP POLICY IF EXISTS "Users can view own reminder logs" ON public.reminder_log;
CREATE POLICY "Users can view own reminder logs" ON public.reminder_log FOR SELECT USING (auth.uid() = user_id);

-- Fetch users eligible for reminders based on local timezone and time
CREATE OR REPLACE FUNCTION public.get_pending_reminders()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  timezone text,
  morning_reminder text,
  night_reminder text,
  local_date date,
  local_time text,
  morning_completed boolean,
  night_completed boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.user_id,
    us.display_name,
    us.timezone,
    COALESCE(us.morning_reminder, '10:00') as morning_reminder,
    COALESCE(us.night_reminder, '20:00') as night_reminder,
    ((now() AT TIME ZONE us.timezone)::date) as local_date,
    to_char((now() AT TIME ZONE us.timezone)::time, 'HH24:MI') as local_time,
    COALESCE(de.morning_completed, false) as morning_completed,
    COALESCE(de.night_completed, false) as night_completed
  FROM public.user_settings us
  LEFT JOIN public.daily_entries de 
    ON de.user_id = us.user_id 
    AND de.entry_date = ((now() AT TIME ZONE us.timezone)::date)
  WHERE us.push_reminders_enabled = true;
END;
$$;

-- Atomic claiming of reminder_log to prevent double sends
CREATE OR REPLACE FUNCTION public.claim_reminder_log(
  p_user_id uuid,
  p_entry_date date,
  p_reminder_type text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.reminder_log (user_id, entry_date, reminder_type, status)
  VALUES (p_user_id, p_entry_date, p_reminder_type, 'pending')
  ON CONFLICT (user_id, entry_date, reminder_type)
  DO UPDATE SET 
    status = 'pending',
    error_message = NULL,
    sent_at = now()
  WHERE reminder_log.status = 'failed'
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Revoke public permissions for security
REVOKE EXECUTE ON FUNCTION public.get_pending_reminders() FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.claim_reminder_log(uuid, date, text) FROM public, authenticated, anon;


-- ============================================================
-- PUSH SUBSCRIPTIONS (Native Web Push API)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can view own subscriptions"   ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscriptions" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);
