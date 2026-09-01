import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type {
  DailyEntry, Priority, ActionStep, Medication, Meal, WindDownItem,
  MealType, WindDownType,
} from '../types/database';

import { isMorningComplete, isNightComplete } from '../lib/utils';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Reduced from 2000ms to 500ms for fast responsive auto-save
const DEBOUNCE_MS = 500;

/* ——— Default empty data ——— */

const DEFAULT_ENTRY_FIELDS: Omit<DailyEntry, 'id' | 'user_id' | 'entry_date' | 'created_at' | 'updated_at'> = {
  daily_note: null,
  morning_mood: null,
  morning_mood_intensity: null,
  morning_motivations: null,
  morning_motivation_other: null,
  morning_why: null,
  morning_brain_dump: null,
  morning_inspire: null,
  morning_completed: false,
  night_mood: null,
  night_mood_intensity: null,
  night_gratitude_1: null,
  night_gratitude_2: null,
  night_gratitude_3: null,
  night_win: null,
  night_went_well: null,
  night_improve: null,
  night_brain_dump: null,
  night_intention: null,
  medication_notes: null,
  water_count: 0,
  night_completed: false,
};

function defaultPriorities(): Omit<Priority, 'id' | 'daily_entry_id' | 'user_id'>[] {
  return [0, 1, 2].map((i) => ({ sort_order: i, text: null, completed: false }));
}

function defaultActions(): Omit<ActionStep, 'id' | 'daily_entry_id' | 'user_id'>[] {
  return [0, 1, 2, 3, 4].map((i) => ({ sort_order: i, text: null, completed: false }));
}

function defaultMeals(): Omit<Meal, 'id' | 'daily_entry_id' | 'user_id'>[] {
  return (['breakfast', 'lunch', 'dinner', 'snacks'] as MealType[]).map((t) => ({
    meal_type: t, ate: false, time: null, notes: null,
  }));
}

function defaultWindDown(): Omit<WindDownItem, 'id' | 'daily_entry_id' | 'user_id'>[] {
  return (['stretch', 'drink_water', 'read', 'deep_breaths', 'early_sleep'] as WindDownType[]).map((t) => ({
    item_type: t, completed: false,
  }));
}

export interface MedicationPreset {
  name: string;
  dose: string | null;
  time: string | null;
}

/** Smart Medication & Dosage parser */
export function parseMedicationFields(
  rawName: string,
  currentDose?: string | null
): { name: string; dose: string | null } {
  let name = (rawName || '').trim();
  let dose = (currentDose || '').trim() || null;

  if (!name) return { name: '', dose };

  // Match explicit dosage units attached at the end of the name:
  // e.g. "Vitamin D 5mg", "Vitamin D 1000 IU", "Aspirin 75 mg", "Omega 3 500mcg", "Syrup 10ml"
  const doseWithUnitRegex = /\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|iu|ui|ml|l|tablets?|tabs?|capsules?|caps?|drops?|puffs?|units?|%))$/i;
  const unitMatch = name.match(doseWithUnitRegex);

  if (unitMatch) {
    const extractedDose = unitMatch[1].trim();
    const cleanedName = name.slice(0, unitMatch.index).trim();

    if (cleanedName.length >= 2) {
      name = cleanedName;
      // If dose field was empty, populate with extracted dose.
      // If user already specified a dose (e.g. "100mg" vs "5mg"), prefer what's in the dose field!
      if (!dose) {
        dose = extractedDose;
      }
    }
  }

  return { name, dose };
}

export function isMedicationShorthand(name: string): boolean {
  const n = (name || '').trim().toLowerCase();
  return /^(again\s+both|again|same\s+both|same\s+meds?|same\s+as\s+yesterday|both|all\s+meds|repeat(\s+yesterday)?|ditto)$/i.test(n);
}

/** Get all medication presets saved when user checks Taken */
export function getMedicationPresets(): MedicationPreset[] {
  try {
    const savedStr = localStorage.getItem('mewwmory_medication_presets');
    if (!savedStr) return [];
    const list: MedicationPreset[] = JSON.parse(savedStr);
    return Array.isArray(list)
      ? list.filter((p) => p && typeof p.name === 'string' && p.name.trim().length >= 2 && !isMedicationShorthand(p.name))
      : [];
  } catch {
    return [];
  }
}

/** Save or update a medication preset (called ONLY when user checks 'Taken: true') */
export function saveMedicationPreset(rawName: string, rawDose?: string | null, rawTime?: string | null) {
  const { name: cleanName, dose: cleanDose } = parseMedicationFields(rawName, rawDose);
  if (!cleanName || cleanName.length < 2) return;

  // Never save conversational shorthand as preset names
  if (isMedicationShorthand(cleanName)) return;

  // Split compound names like "inspiral and inderel", "Zinc & Magnesium", "Calcium + D3"
  const splitNames = cleanName
    .split(/\s+(?:and|&|\+)\s+|,\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !isMedicationShorthand(s));

  if (splitNames.length === 0) return;

  try {
    const list = getMedicationPresets();
    const map = new Map<string, MedicationPreset>();
    list.forEach((p) => {
      if (!isMedicationShorthand(p.name)) {
        map.set(p.name.toLowerCase(), p);
      }
    });

    splitNames.forEach((singleName) => {
      const formatted = singleName.charAt(0).toUpperCase() + singleName.slice(1);
      map.set(formatted.toLowerCase(), {
        name: formatted,
        dose: cleanDose || null,
        time: (rawTime || '').trim() || null,
      });
    });

    localStorage.setItem('mewwmory_medication_presets', JSON.stringify(Array.from(map.values())));
  } catch (e) {
    console.error('Error saving medication preset:', e);
  }
}

/** Remove a preset from storage */
export function deleteMedicationPreset(name: string) {
  const cleanName = (name || '').trim().toLowerCase();
  try {
    const list = getMedicationPresets().filter((p) => p.name.trim().toLowerCase() !== cleanName);
    localStorage.setItem('mewwmory_medication_presets', JSON.stringify(list));
  } catch (e) {
    console.error('Error deleting medication preset:', e);
  }
}

/* ——— Hook ——— */

export function useDailyEntry(dateStr: string) {
  const user = useAuthStore((s) => s.user);

  /* — State — */
  const [entryId, setEntryId] = useState<string | null>(null);
  const [entryFields, setEntryFields] = useState({ ...DEFAULT_ENTRY_FIELDS });
  const [priorities, setPriorities] = useState<any[]>(defaultPriorities());
  const [actionSteps, setActionSteps] = useState<any[]>(defaultActions());
  const [medications, setMedications] = useState<Medication[]>([]);
  const [meals, setMeals] = useState<any[]>(defaultMeals());
  const [windDownItems, setWindDownItems] = useState<any[]>(defaultWindDown());
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  /* — Refs for doSave (always read latest state) — */
  const dateStrRef = useRef(dateStr);
  const entryIdRef = useRef(entryId);
  const entryFieldsRef = useRef(entryFields);
  const prioritiesRef = useRef(priorities);
  const actionStepsRef = useRef(actionSteps);
  const medicationsRef = useRef(medications);
  const mealsRef = useRef(meals);
  const windDownRef = useRef(windDownItems);

  useEffect(() => { dateStrRef.current = dateStr; }, [dateStr]);
  useEffect(() => { entryIdRef.current = entryId; }, [entryId]);
  useEffect(() => { entryFieldsRef.current = entryFields; }, [entryFields]);
  useEffect(() => { prioritiesRef.current = priorities; }, [priorities]);
  useEffect(() => { actionStepsRef.current = actionSteps; }, [actionSteps]);
  useEffect(() => { medicationsRef.current = medications; }, [medications]);
  useEffect(() => { mealsRef.current = meals; }, [meals]);
  useEffect(() => { windDownRef.current = windDownItems; }, [windDownItems]);

  /* Helper to sync current state to local offline cache immediately */
  const syncLocalCache = useCallback(() => {
    saveToLocalCache(
      dateStrRef.current,
      {
        ...entryFieldsRef.current,
        id: entryIdRef.current || undefined,
        morning_completed: isMorningComplete(entryFieldsRef.current, prioritiesRef.current, actionStepsRef.current),
        night_completed: isNightComplete(entryFieldsRef.current, mealsRef.current, windDownRef.current),
      },
      prioritiesRef.current,
      actionStepsRef.current,
      mealsRef.current,
      windDownRef.current,
      medicationsRef.current
    );
  }, []);

  /* ——— Load entry for date ——— */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setSaveStatus('idle');
    dirtyRef.current = false;

    // Check offline cache first for instant display
    try {
      const cacheStr = localStorage.getItem('daylight_offline_cache');
      if (cacheStr) {
        const cache = JSON.parse(cacheStr);
        const cachedData = cache[dateStr];
        if (cachedData) {
          setEntryId(cachedData.id || null);
          setEntryFields(extractFields(cachedData));
          
          const cPriorities = (cachedData.priorities as Priority[]) || [];
          const normalizedCP = [0, 1, 2].map((i) => {
            const found = cPriorities.find((p) => p.sort_order === i) || cPriorities[i];
            return found ? { ...found, sort_order: i } : { sort_order: i, text: null, completed: false };
          });
          prioritiesRef.current = normalizedCP;
          setPriorities(normalizedCP);

          const cActions = (cachedData.action_steps as ActionStep[]) || [];
          const normalizedCA = [0, 1, 2, 3, 4].map((i) => {
            const found = cActions.find((a) => a.sort_order === i) || cActions[i];
            return found ? { ...found, sort_order: i } : { sort_order: i, text: null, completed: false };
          });
          actionStepsRef.current = normalizedCA;
          setActionSteps(normalizedCA);

          const rawCachedMeds = (cachedData.medications as Medication[]) || [];
          const cSeen = new Set<string>();
          const cachedMeds: Medication[] = [];
          rawCachedMeds.forEach((m) => {
            if (m && m.name && m.name.trim()) {
              const k = m.name.trim().toLowerCase();
              if (!cSeen.has(k)) {
                cSeen.add(k);
                cachedMeds.push({ ...m, sort_order: cachedMeds.length });
              }
            }
          });
          setMedications(cachedMeds);
          medicationsRef.current = cachedMeds;

          setMeals(cachedData.meals || defaultMeals());
          setWindDownItems(cachedData.wind_down_items || defaultWindDown());
        }
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }

    const { data, error: fetchErr } = await supabase
      .from('daily_entries')
      .select(`
        *,
        priorities ( * ),
        action_steps ( * ),
        medications ( * ),
        meals ( * ),
        wind_down_items ( * )
      `)
      .eq('user_id', user.id)
      .eq('entry_date', dateStr)
      .maybeSingle();

    if (fetchErr) {
      console.error('Load entry error:', fetchErr);
      setLoading(false);
      return;
    }

    if (data) {
      setEntryId(data.id);
      setEntryFields(extractFields(data));
      
      const loadedPriorities = ((data.priorities as Priority[]) || []).sort((a, b) => a.sort_order - b.sort_order);
      const normalizedP = [0, 1, 2].map((i) => {
        const found = loadedPriorities.find((p) => p.sort_order === i);
        return found ? { ...found } : { sort_order: i, text: null, completed: false };
      });
      prioritiesRef.current = normalizedP;
      setPriorities(normalizedP);

      const loadedActions = ((data.action_steps as ActionStep[]) || []).sort((a, b) => a.sort_order - b.sort_order);
      const normalizedA = [0, 1, 2, 3, 4].map((i) => {
        const found = loadedActions.find((a) => a.sort_order === i);
        return found ? { ...found } : { sort_order: i, text: null, completed: false };
      });
      actionStepsRef.current = normalizedA;
      setActionSteps(normalizedA);

      // Deduplicate loaded medications by name to clean up any past duplicate inserts
      const rawMeds = (data.medications as Medication[]) || [];
      const seen = new Set<string>();
      const loadedMeds: Medication[] = [];
      rawMeds
        .filter((m) => m && m.name && m.name.trim())
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((m) => {
          const k = (m.name || '').trim().toLowerCase();
          if (k && !seen.has(k)) {
            seen.add(k);
            loadedMeds.push({ ...m, sort_order: loadedMeds.length });
          }
        });

      setMedications(loadedMeds);
      medicationsRef.current = loadedMeds;

      setMeals(
        (data.meals as Meal[]).length > 0
          ? (data.meals as Meal[])
          : defaultMeals(),
      );
      setWindDownItems(
        (data.wind_down_items as WindDownItem[]).length > 0
          ? (data.wind_down_items as WindDownItem[])
          : defaultWindDown(),
      );

      saveToLocalCache(
        dateStr,
        extractFields(data),
        normalizedP,
        normalizedA,
        data.meals || [],
        data.wind_down_items || [],
        loadedMeds
      );
    } else {
      // No entry in DB yet -> clean default fields with empty medications
      setEntryId(null);
      setEntryFields({ ...DEFAULT_ENTRY_FIELDS });
      const defP = defaultPriorities();
      const defA = defaultActions();
      prioritiesRef.current = defP;
      actionStepsRef.current = defA;
      setPriorities(defP);
      setActionSteps(defA);
      setMedications([]);
      medicationsRef.current = [];
      setMeals(defaultMeals());
      setWindDownItems(defaultWindDown());
    }
    setLoading(false);
  }, [user, dateStr]);

  useEffect(() => {
    load();

    const handleBeforeUnload = () => {
      if (dirtyRef.current) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        syncLocalCache();
        doSave();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        syncLocalCache();
        doSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dirtyRef.current) {
        syncLocalCache();
        doSave();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load, syncLocalCache]);

  /* ——— Schedule / Flush save ——— */

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    syncLocalCache();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(() => {
      doSave();
    }, DEBOUNCE_MS);
  }, [syncLocalCache]);

  /** Flush: cancel debounce and save immediately. Call this on blur or date switch. */
  const flushSave = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    syncLocalCache();
    if (dirtyRef.current) {
      await doSave();
    }
  }, [syncLocalCache]);

  /* ——— Persist to Supabase ——— */

  const doSave = async () => {
    if (!user) return;
    if (!dirtyRef.current && !savingRef.current) { setSaveStatus('idle'); return; }

    dirtyRef.current = false;
    savingRef.current = true;
    setSaveStatus('saving');

    try {
      const targetDate = dateStrRef.current;
      const fields = entryFieldsRef.current;

      const morningCompleted = isMorningComplete(fields, prioritiesRef.current, actionStepsRef.current);
      const nightCompleted = isNightComplete(fields, mealsRef.current, windDownRef.current);

      // 1. Upsert daily entry
      const entryPayload = {
        user_id: user.id,
        entry_date: targetDate,
        ...fields,
        morning_completed: morningCompleted,
        night_completed: nightCompleted,
        updated_at: new Date().toISOString(),
      };

      const { data: entryData, error: entryErr } = await supabase
        .from('daily_entries')
        .upsert(entryPayload, { onConflict: 'user_id,entry_date' })
        .select()
        .single();

      if (entryErr) throw entryErr;

      const savedId = entryData.id as string;
      setEntryId(savedId);
      entryIdRef.current = savedId;

      setEntryFields((prev) => ({
        ...prev,
        morning_completed: morningCompleted,
        night_completed: nightCompleted,
      }));

      // 2. Upsert priorities
      const pRows = prioritiesRef.current.map((p: any, idx: number) => ({
        daily_entry_id: savedId,
        user_id: user.id,
        sort_order: idx,
        text: p.text || null,
        completed: p.completed ?? false,
      }));
      const { data: pData } = await supabase
        .from('priorities')
        .upsert(pRows, { onConflict: 'daily_entry_id,sort_order' })
        .select();
      if (pData) {
        pData.forEach((row: any) => {
          if (prioritiesRef.current[row.sort_order]) {
            prioritiesRef.current[row.sort_order].id = row.id;
            prioritiesRef.current[row.sort_order].daily_entry_id = savedId;
          }
        });
      }

      // 3. Upsert action steps
      const aRows = actionStepsRef.current.map((a: any, idx: number) => ({
        daily_entry_id: savedId,
        user_id: user.id,
        sort_order: idx,
        text: a.text || null,
        completed: a.completed ?? false,
      }));
      const { data: aData } = await supabase
        .from('action_steps')
        .upsert(aRows, { onConflict: 'daily_entry_id,sort_order' })
        .select();
      if (aData) {
        aData.forEach((row: any) => {
          if (actionStepsRef.current[row.sort_order]) {
            actionStepsRef.current[row.sort_order].id = row.id;
            actionStepsRef.current[row.sort_order].daily_entry_id = savedId;
          }
        });
      }

      // 4. Upsert meals
      const mRows = mealsRef.current.map((m: any) => ({
        daily_entry_id: savedId,
        user_id: user.id,
        meal_type: m.meal_type,
        ate: m.ate ?? false,
        time: m.time || null,
        notes: m.notes || null,
      }));
      const { data: mData } = await supabase
        .from('meals')
        .upsert(mRows, { onConflict: 'daily_entry_id,meal_type' })
        .select();
      if (mData) {
        mData.forEach((row: any) => {
          const target = mealsRef.current.find((m) => m.meal_type === row.meal_type);
          if (target) {
            target.id = row.id;
            target.daily_entry_id = savedId;
          }
        });
      }

      // 5. Upsert wind down items
      const wRows = windDownRef.current.map((w: any) => ({
        daily_entry_id: savedId,
        user_id: user.id,
        item_type: w.item_type,
        completed: w.completed ?? false,
      }));
      const { data: wData } = await supabase
        .from('wind_down_items')
        .upsert(wRows, { onConflict: 'daily_entry_id,item_type' })
        .select();
      if (wData) {
        wData.forEach((row: any) => {
          const target = windDownRef.current.find((w) => w.item_type === row.item_type);
          if (target) {
            target.id = row.id;
            target.daily_entry_id = savedId;
          }
        });
      }

      // 6. Sync medications: atomic replace for this day's entry
      const validMeds = medicationsRef.current.filter((m) => m && m.name && m.name.trim().length > 0);
      
      await supabase.from('medications').delete().eq('daily_entry_id', savedId);

      if (validMeds.length > 0) {
        const medRows = validMeds.map((m, idx) => {
          const { name: cleanName, dose: cleanDose } = parseMedicationFields(m.name || '', m.dose);
          return {
            daily_entry_id: savedId,
            user_id: user.id,
            sort_order: idx,
            name: cleanName,
            dose: cleanDose,
            time: m.time || null,
            taken: m.taken ?? false,
          };
        });
        const { data: medData } = await supabase
          .from('medications')
          .insert(medRows)
          .select();
        if (medData) {
          medData.forEach((row: any) => {
            if (medicationsRef.current[row.sort_order]) {
              medicationsRef.current[row.sort_order].daily_entry_id = savedId;
            }
          });
        }
      }

      setSaveStatus('saved');
      setError(null);

      saveToLocalCache(
        targetDate,
        {
          ...fields,
          id: savedId,
          morning_completed: morningCompleted,
          night_completed: nightCompleted,
        },
        prioritiesRef.current,
        actionStepsRef.current,
        mealsRef.current,
        windDownRef.current,
        medicationsRef.current
      );
    } catch (err: any) {
      console.error('Save error:', err);
      setSaveStatus('error');
      setError(err.message || 'Failed to save');
    } finally {
      savingRef.current = false;
    }
  };

  /* ——— Field updaters ——— */

  const updateField = useCallback((field: keyof DailyEntry, value: any) => {
    entryFieldsRef.current = { ...entryFieldsRef.current, [field]: value };
    setEntryFields((prev) => ({ ...prev, [field]: value }));
    scheduleSave();
  }, [scheduleSave]);

  const updatePriority = useCallback((index: number, field: keyof Priority, value: any) => {
    setPriorities((prev) => {
      const next = [0, 1, 2].map((i) => prev[i] ? { ...prev[i] } : { sort_order: i, text: null, completed: false });
      next[index] = { ...next[index], [field]: value };
      prioritiesRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateActionStep = useCallback((index: number, field: keyof ActionStep, value: any) => {
    setActionSteps((prev) => {
      const next = [0, 1, 2, 3, 4].map((i) => prev[i] ? { ...prev[i] } : { sort_order: i, text: null, completed: false });
      next[index] = { ...next[index], [field]: value };
      actionStepsRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateMeal = useCallback((mealType: string, field: keyof Meal, value: any) => {
    const next = mealsRef.current.map((m: any) => {
      if (m.meal_type !== mealType) return m;
      if (field === 'time') {
        const hasTime = !!(value && String(value).trim());
        return { ...m, time: value, ate: hasTime };
      }
      if (field === 'ate') {
        const hasTime = !!(m.time && String(m.time).trim());
        return { ...m, ate: value && hasTime };
      }
      return { ...m, [field]: value };
    });
    mealsRef.current = next;
    setMeals(next);
    scheduleSave();
  }, [scheduleSave]);

  const updateWindDown = useCallback((itemType: string, completed: boolean) => {
    const next = windDownRef.current.map((w: any) =>
      w.item_type === itemType ? { ...w, completed } : w
    );
    windDownRef.current = next;
    setWindDownItems(next);
    scheduleSave();
  }, [scheduleSave]);

  /* ——— Medications ——— */

  const ensureEntryPersisted = async (): Promise<string | null> => {
    if (entryIdRef.current) return entryIdRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const { data, error: err } = await supabase
      .from('daily_entries')
      .upsert({
        user_id: user!.id,
        entry_date: dateStr,
        ...entryFieldsRef.current,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,entry_date' })
      .select()
      .single();

    if (err || !data) {
      console.error('ensureEntryPersisted error:', err);
      return null;
    }

    setEntryId(data.id);
    entryIdRef.current = data.id;
    return data.id;
  };

  const addMedication = useCallback((preset?: Partial<Medication>) => {
    setMedications((prev) => {
      const presetName = (preset?.name || '').trim();
      if (presetName) {
        // If already exists on this day, update its values instead of creating duplicate row
        const existingIdx = prev.findIndex((m) => (m.name || '').trim().toLowerCase() === presetName.toLowerCase());
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            dose: preset?.dose !== undefined ? preset.dose : next[existingIdx].dose,
            time: preset?.time !== undefined ? preset.time : next[existingIdx].time,
          };
          medicationsRef.current = next;
          return next;
        }
      }

      const newMed: Medication = {
        id: `temp_${Date.now()}_${prev.length}`,
        daily_entry_id: entryIdRef.current || '',
        user_id: user?.id || '',
        sort_order: prev.length,
        name: presetName,
        dose: preset?.dose || '',
        time: preset?.time || '',
        taken: false,
      };
      const next = [...prev, newMed];
      medicationsRef.current = next;
      return next;
    });
    scheduleSave();
  }, [user, scheduleSave]);

  const removeMedication = useCallback((id: string) => {
    setMedications((prev) => {
      const next = prev.filter((m) => m.id !== id);
      medicationsRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const clearAllMedications = useCallback(() => {
    setMedications([]);
    medicationsRef.current = [];
    scheduleSave();
  }, [scheduleSave]);

  const updateMedication = useCallback((id: string, field: keyof Medication, value: any) => {
    setMedications((prev) => {
      const next = prev.map((m) => {
        if (m.id === id) {
          const updated = { ...m, [field]: value };
          // ONLY save/update preset when user checks Taken to true!
          if (field === 'taken' && value === true && updated.name && updated.name.trim().length >= 2) {
            saveMedicationPreset(updated.name, updated.dose, updated.time);
          }
          return updated;
        }
        return m;
      });
      medicationsRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const clearEntireDay = useCallback(async () => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    savingRef.current = false;
    dirtyRef.current = false;

    setLoading(true);

    try {
      // 1. Delete from database if saved
      if (entryIdRef.current) {
        await Promise.all([
          supabase.from('priorities').delete().eq('daily_entry_id', entryIdRef.current),
          supabase.from('action_steps').delete().eq('daily_entry_id', entryIdRef.current),
          supabase.from('medications').delete().eq('daily_entry_id', entryIdRef.current),
          supabase.from('meals').delete().eq('daily_entry_id', entryIdRef.current),
          supabase.from('wind_down_items').delete().eq('daily_entry_id', entryIdRef.current),
        ]);
        await supabase.from('daily_entries').delete().eq('id', entryIdRef.current);
      } else {
        await supabase.from('daily_entries').delete().eq('user_id', user.id).eq('entry_date', dateStr);
      }

      // 2. Remove from local offline cache
      try {
        const raw = localStorage.getItem('daylight_offline_cache');
        if (raw) {
          const cache = JSON.parse(raw);
          delete cache[dateStr];
          localStorage.setItem('daylight_offline_cache', JSON.stringify(cache));
        }
      } catch (e) {
        console.error('Error clearing local cache for date:', e);
      }

      // 3. Reset all React state and Refs
      setEntryId(null);
      entryIdRef.current = null;

      const defFields = { ...DEFAULT_ENTRY_FIELDS };
      const defP = defaultPriorities();
      const defA = defaultActions();
      const defM = defaultMeals();
      const defW = defaultWindDown();

      setEntryFields(defFields);
      entryFieldsRef.current = defFields;

      setPriorities(defP);
      prioritiesRef.current = defP;

      setActionSteps(defA);
      actionStepsRef.current = defA;

      setMedications([]);
      medicationsRef.current = [];

      setMeals(defM);
      mealsRef.current = defM;

      setWindDownItems(defW);
      windDownRef.current = defW;

      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Error clearing entire day:', err);
      setError(err.message || 'Failed to clear day');
    } finally {
      setLoading(false);
    }
  }, [user, dateStr]);

  /* ——— Build the entry object for consumers ——— */
  const entry: DailyEntry | null = loading ? null : {
    id: entryId || '',
    user_id: user?.id || '',
    entry_date: dateStr,
    ...entryFields,
    created_at: '',
    updated_at: '',
  } as DailyEntry;

  return {
    entry, priorities, actionSteps, medications, meals, windDownItems,
    loading, saveStatus, error,
    updateField, updatePriority, updateActionStep,
    updateMeal, updateWindDown,
    addMedication, removeMedication, clearAllMedications, updateMedication,
    clearEntireDay,
    flushSave,
  };
}

/* ——— Helpers ——— */

function extractFields(e: any): typeof DEFAULT_ENTRY_FIELDS {
  return {
    daily_note: e.daily_note,
    morning_mood: e.morning_mood,
    morning_mood_intensity: e.morning_mood_intensity,
    morning_motivations: e.morning_motivations,
    morning_motivation_other: e.morning_motivation_other,
    morning_why: e.morning_why,
    morning_brain_dump: e.morning_brain_dump,
    morning_inspire: e.morning_inspire,
    morning_completed: e.morning_completed,
    night_mood: e.night_mood,
    night_mood_intensity: e.night_mood_intensity,
    night_gratitude_1: e.night_gratitude_1,
    night_gratitude_2: e.night_gratitude_2,
    night_gratitude_3: e.night_gratitude_3,
    night_win: e.night_win,
    night_went_well: e.night_went_well,
    night_improve: e.night_improve,
    night_brain_dump: e.night_brain_dump,
    night_intention: e.night_intention,
    medication_notes: e.medication_notes,
    water_count: e.water_count,
    night_completed: e.night_completed,
  };
}

export function saveToLocalCache(
  date: string,
  entry: any,
  priorities: any[],
  actionSteps: any[],
  meals: any[],
  windDown: any[],
  meds: any[]
) {
  try {
    const cacheStr = localStorage.getItem('daylight_offline_cache') || '{}';
    const cache = JSON.parse(cacheStr);
    cache[date] = {
      ...(cache[date] || {}),
      ...entry,
      priorities,
      action_steps: actionSteps,
      meals,
      wind_down_items: windDown,
      medications: meds,
      entry_date: date,
      updated_at: new Date().toISOString()
    };
    localStorage.setItem('daylight_offline_cache', JSON.stringify(cache));
  } catch (err) {
    console.error('Error writing to offline cache:', err);
  }
}
