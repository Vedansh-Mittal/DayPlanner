import { supabase } from './supabase';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { DailyEntry, MoodOption, MOOD_OPTIONS } from '../types/database';

/* ===== Types ===== */

export interface InsightResponse {
  dateRange: { start: string; end: string };
  summary: string;
  stats: Record<string, any>;
  insufficientData: boolean;
}

const MIN_ENTRIES = 1;

/* ===== Main query handler ===== */

export async function queryInsights(
  userId: string,
  question: string,
): Promise<InsightResponse> {
  // 1. First, attempt to invoke the AI Insights Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('query-insights', {
      body: { question },
    });

    if (!error && data && data.summary) {
      return {
        dateRange: data.dateRange || { start: '', end: '' },
        summary: data.summary,
        stats: data.stats || {},
        insufficientData: !!data.insufficientData,
      };
    }
    if (error) {
      console.warn('Edge function returned error, falling back to local analysis:', error);
    }
  } catch (err) {
    console.warn('Failed to reach AI insights function, using local engine:', err);
  }

  // 2. Fallback to deterministic local engine
  // Determine date range from question
  const range = parseDateRange(question);

  // Fetch entries in range
  const { data, error } = await supabase
    .from('daily_entries')
    .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*)')
    .eq('user_id', userId)
    .gte('entry_date', range.start)
    .lte('entry_date', range.end)
    .order('entry_date', { ascending: true });

  if (error) {
    return {
      dateRange: range,
      summary: 'Sorry, I had trouble fetching your data. Please try again.',
      stats: {},
      insufficientData: true,
    };
  }

  const entries = (data || []) as (DailyEntry & { priorities: any[]; action_steps: any[]; meals: any[]; wind_down_items: any[] })[];

  if (entries.length === 0) {
    return {
      dateRange: range,
      summary: `I couldn't find any planner entries for ${range.start === range.end ? range.start : `the range ${range.start} to ${range.end}`}. Try checking another date or logging your entry!`,
      stats: { entryCount: 0 },
      insufficientData: true,
    };
  }

  // Route to specific analysis
  const q = question.toLowerCase();

  if (q.includes('gratitude') || q.includes('grateful')) {
    const gratitudes = entries.flatMap((e) => [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3]).filter(Boolean);
    if (gratitudes.length > 0) {
      return {
        dateRange: range,
        summary: `🌸 Things You Were Grateful For (${range.start} to ${range.end}):\n\n` +
          gratitudes.slice(0, 10).map((g) => `• ${g}`).join('\n'),
        stats: { count: gratitudes.length },
        insufficientData: false,
      };
    }
  }

  if (q.includes('brain dump') || q.includes('thoughts')) {
    const dumps = entries.map((e) => ({ date: e.entry_date, morning: e.morning_brain_dump, night: e.night_brain_dump })).filter((d) => d.morning || d.night);
    if (dumps.length > 0) {
      return {
        dateRange: range,
        summary: `🧠 Brain Dump Observations (${range.start} to ${range.end}):\n\n` +
          dumps.slice(0, 5).map((d) => `📅 **${d.date}**:\n${d.morning ? `• Morning: ${d.morning}\n` : ''}${d.night ? `• Night: ${d.night}\n` : ''}`).join('\n'),
        stats: { dumpCount: dumps.length },
        insufficientData: false,
      };
    }
  }

  if (q.includes('mood')) {
    return moodAnalysis(entries, range);
  }
  if (q.includes('water') || q.includes('hydration') || q.includes('drink')) {
    return waterAnalysis(entries, range);
  }
  if (q.includes('happiest') || q.includes('activities') || q.includes('happy')) {
    return happinessCorrelation(entries, range);
  }
  if (q.includes('pattern') || q.includes('notice')) {
    return patternAnalysis(entries, range);
  }
  if (q.includes('summarize') || q.includes('summary') || q.includes('last') || q.includes('on') || q.includes('how was')) {
    return generalSummary(entries, range);
  }

  // Default: general summary
  return generalSummary(entries, range);
}

/* ===== Date range parsing ===== */

function parseDateRange(question: string): { start: string; end: string } {
  const today = new Date();
  const q = question.toLowerCase();

  const months: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  if (q.includes('today')) {
    const tStr = format(today, 'yyyy-MM-dd');
    return { start: tStr, end: tStr };
  }
  if (q.includes('yesterday')) {
    const yStr = format(subDays(today, 1), 'yyyy-MM-dd');
    return { start: yStr, end: yStr };
  }

  // Check for month name + day number (e.g., "30th august", "august 30", "30 aug")
  for (const [mName, mIdx] of Object.entries(months)) {
    if (q.includes(mName)) {
      const match = q.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
      if (match) {
        const dayNum = parseInt(match[1], 10);
        if (dayNum >= 1 && dayNum <= 31) {
          const year = today.getFullYear();
          const targetDate = new Date(year, mIdx, dayNum);
          const dStr = format(targetDate, 'yyyy-MM-dd');
          return { start: dStr, end: dStr };
        }
      }
    }
  }

  if (q.includes('last week') || q.includes('past week') || q.includes('seven days') || q.includes('7 days')) {
    return {
      start: format(subDays(today, 7), 'yyyy-MM-dd'),
      end: format(today, 'yyyy-MM-dd'),
    };
  }
  if (q.includes('this month') || q.includes('month')) {
    return {
      start: format(startOfMonth(today), 'yyyy-MM-dd'),
      end: format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  if (q.includes('last month') || q.includes('past month')) {
    const lastMonth = subMonths(today, 1);
    return {
      start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
      end: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
    };
  }
  if (q.includes('two weeks') || q.includes('2 weeks') || q.includes('14 days')) {
    return {
      start: format(subDays(today, 14), 'yyyy-MM-dd'),
      end: format(today, 'yyyy-MM-dd'),
    };
  }
  // Default: last 30 days
  return {
    start: format(subDays(today, 30), 'yyyy-MM-dd'),
    end: format(today, 'yyyy-MM-dd'),
  };
}

/* ===== Analysis functions ===== */

function moodAnalysis(
  entries: DailyEntry[],
  range: { start: string; end: string },
): InsightResponse {
  const morningMoods = entries.filter((e) => e.morning_mood).map((e) => e.morning_mood as MoodOption);
  const nightMoods = entries.filter((e) => e.night_mood).map((e) => e.night_mood as MoodOption);
  const morningIntensities = entries.filter((e) => e.morning_mood_intensity).map((e) => e.morning_mood_intensity!);
  const nightIntensities = entries.filter((e) => e.night_mood_intensity).map((e) => e.night_mood_intensity!);

  const moodScores: Record<MoodOption, number> = {
    amazing: 5, good: 4, okay: 3, tired: 2, anxious: 2,
    overwhelmed: 1, sad: 1, irritable: 1, meh: 2,
  };

  const morningAvg = morningMoods.length > 0
    ? morningMoods.reduce((s, m) => s + moodScores[m], 0) / morningMoods.length
    : 0;
  const nightAvg = nightMoods.length > 0
    ? nightMoods.reduce((s, m) => s + moodScores[m], 0) / nightMoods.length
    : 0;

  const morningDist = countOccurrences(morningMoods);
  const nightDist = countOccurrences(nightMoods);
  const topMorning = Object.entries(morningDist).sort((a, b) => b[1] - a[1])[0];
  const topNight = Object.entries(nightDist).sort((a, b) => b[1] - a[1])[0];

  const avgIntensityMorning = morningIntensities.length > 0
    ? (morningIntensities.reduce((a, b) => a + b, 0) / morningIntensities.length).toFixed(1)
    : 'N/A';
  const avgIntensityNight = nightIntensities.length > 0
    ? (nightIntensities.reduce((a, b) => a + b, 0) / nightIntensities.length).toFixed(1)
    : 'N/A';

  let summary = `📊 Mood Analysis (${range.start} to ${range.end})\n\n`;
  summary += `Based on ${entries.length} entries:\n\n`;

  if (morningMoods.length > 0) {
    summary += `☀️ Morning: Your most frequent mood was "${topMorning[0]}" (${topMorning[1]} times). `;
    summary += `Average mood score: ${morningAvg.toFixed(1)}/5. Average intensity: ${avgIntensityMorning}/5.\n\n`;
  }
  if (nightMoods.length > 0) {
    summary += `🌙 Night: Your most frequent mood was "${topNight[0]}" (${topNight[1]} times). `;
    summary += `Average mood score: ${nightAvg.toFixed(1)}/5. Average intensity: ${avgIntensityNight}/5.\n\n`;
  }

  if (morningAvg > 0 && nightAvg > 0) {
    const diff = nightAvg - morningAvg;
    if (diff > 0.5) {
      summary += `📈 Observation: Your mood tends to improve throughout the day.\n`;
    } else if (diff < -0.5) {
      summary += `📉 Observation: Your mood tends to dip by evening.\n`;
    } else {
      summary += `➡️ Observation: Your mood stays fairly consistent from morning to night.\n`;
    }
  }

  return {
    dateRange: range,
    summary,
    stats: { morningDist, nightDist, morningAvg, nightAvg },
    insufficientData: false,
  };
}

function waterAnalysis(
  entries: DailyEntry[],
  range: { start: string; end: string },
): InsightResponse {
  const waterEntries = entries.filter((e) => e.water_count != null);
  if (waterEntries.length === 0) {
    return {
      dateRange: range,
      summary: `I don't have any water tracking data between ${range.start} and ${range.end}. Try logging your water intake and check back!`,
      stats: {},
      insufficientData: true,
    };
  }

  const counts = waterEntries.map((e) => e.water_count);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const daysAbove8 = counts.filter((c) => c >= 8).length;

  if (waterEntries.length === 1 || range.start === range.end) {
    const e = waterEntries[0];
    const count = e.water_count;
    let summary = `💧 Water Intake on ${e.entry_date}:\n\n`;
    summary += `You logged ${count} glass${count === 1 ? '' : 'es'} of water.`;
    if (count >= 8) {
      summary += ` 🎉 You met your 8-glass goal!`;
    } else {
      summary += ` (Goal: 8 glasses)`;
    }
    return {
      dateRange: range,
      summary,
      stats: { water_count: count },
      insufficientData: false,
    };
  }

  let summary = `💧 Water Intake (${range.start} to ${range.end})\n\n`;
  summary += `Based on ${waterEntries.length} days of tracking:\n\n`;
  summary += `• Average: ${avg.toFixed(1)} glasses/day\n`;
  summary += `• Best day: ${max} glasses\n`;
  summary += `• Lowest day: ${min} glasses\n`;
  summary += `• Days meeting 8-glass goal: ${daysAbove8} out of ${waterEntries.length} (${((daysAbove8 / waterEntries.length) * 100).toFixed(0)}%)\n\n`;

  if (avg >= 8) {
    summary += `🎉 Great job staying hydrated!`;
  } else if (avg >= 6) {
    summary += `💪 You're close to your goal! A glass or two more each day would get you there.`;
  } else {
    summary += `🌊 Room for improvement — try keeping a water bottle nearby as a reminder.`;
  }

  return {
    dateRange: range,
    summary,
    stats: { avg, max, min, daysAbove8, totalDays: waterEntries.length },
    insufficientData: false,
  };
}

function happinessCorrelation(
  entries: (DailyEntry & { wind_down_items: any[]; meals: any[] })[],
  range: { start: string; end: string },
): InsightResponse {
  const happyMoods = ['amazing', 'good'];

  const happyDays = entries.filter((e) => happyMoods.includes(e.morning_mood || '') || happyMoods.includes(e.night_mood || ''));
  const otherDays = entries.filter((e) => !happyMoods.includes(e.morning_mood || '') && !happyMoods.includes(e.night_mood || ''));

  // Compare wind-down completion on happy vs other days
  const happyWindDown = happyDays.flatMap((e) => e.wind_down_items || []).filter((w: any) => w.completed).length;
  const happyWindDownTotal = happyDays.flatMap((e) => e.wind_down_items || []).length;
  const otherWindDown = otherDays.flatMap((e) => e.wind_down_items || []).filter((w: any) => w.completed).length;
  const otherWindDownTotal = otherDays.flatMap((e) => e.wind_down_items || []).length;

  // Compare water on happy vs other days
  const happyWaterAvg = happyDays.length > 0
    ? happyDays.reduce((s, e) => s + e.water_count, 0) / happyDays.length : 0;
  const otherWaterAvg = otherDays.length > 0
    ? otherDays.reduce((s, e) => s + e.water_count, 0) / otherDays.length : 0;

  let summary = `😊 Happiness Observations (${range.start} to ${range.end})\n\n`;
  summary += `Out of ${entries.length} entries, you reported feeling "amazing" or "good" on ${happyDays.length} days.\n\n`;

  if (happyDays.length > 0 && otherDays.length > 0) {
    const happyRate = happyWindDownTotal > 0 ? ((happyWindDown / happyWindDownTotal) * 100).toFixed(0) : 'N/A';
    const otherRate = otherWindDownTotal > 0 ? ((otherWindDown / otherWindDownTotal) * 100).toFixed(0) : 'N/A';

    summary += `🧘 Wind-down completion on happy days: ${happyRate}% vs other days: ${otherRate}%\n`;
    summary += `💧 Water intake on happy days: ${happyWaterAvg.toFixed(1)} vs other days: ${otherWaterAvg.toFixed(1)} glasses\n\n`;

    summary += `⚠️ Note: These are observations, not proof of causation. Many factors affect mood.`;
  } else {
    summary += `More varied mood data will help identify patterns.`;
  }

  return {
    dateRange: range,
    summary,
    stats: { happyDays: happyDays.length, totalDays: entries.length },
    insufficientData: false,
  };
}

function patternAnalysis(
  entries: (DailyEntry & { priorities: any[]; action_steps: any[] })[],
  range: { start: string; end: string },
): InsightResponse {
  // Completion rates
  const morningDone = entries.filter((e) => e.morning_completed).length;
  const nightDone = entries.filter((e) => e.night_completed).length;

  // Priority completion
  const allPriorities = entries.flatMap((e) => e.priorities || []);
  const priWithText = allPriorities.filter((p: any) => p.text && p.text.trim());
  const priCompleted = priWithText.filter((p: any) => p.completed).length;

  // Action step completion
  const allActions = entries.flatMap((e) => e.action_steps || []);
  const actWithText = allActions.filter((a: any) => a.text && a.text.trim());
  const actCompleted = actWithText.filter((a: any) => a.completed).length;

  // Common words in brain dumps and notes
  const allText = entries
    .map((e) => [e.daily_note, e.morning_brain_dump, e.night_brain_dump, e.morning_why, e.night_intention].filter(Boolean).join(' '))
    .join(' ');
  const commonWords = getTopWords(allText, 5);

  let summary = `🔍 Pattern Analysis (${range.start} to ${range.end})\n\n`;
  summary += `Based on ${entries.length} entries:\n\n`;
  summary += `☀️ Morning check-ins completed: ${morningDone}/${entries.length} (${pct(morningDone, entries.length)})\n`;
  summary += `🌙 Night check-ins completed: ${nightDone}/${entries.length} (${pct(nightDone, entries.length)})\n\n`;

  if (priWithText.length > 0) {
    summary += `🎯 Priorities set: ${priWithText.length}, completed: ${priCompleted} (${pct(priCompleted, priWithText.length)})\n`;
  }
  if (actWithText.length > 0) {
    summary += `✅ Action steps set: ${actWithText.length}, completed: ${actCompleted} (${pct(actCompleted, actWithText.length)})\n`;
  }

  if (commonWords.length > 0) {
    summary += `\n📝 Frequently mentioned words: ${commonWords.join(', ')}\n`;
  }

  return {
    dateRange: range,
    summary,
    stats: { morningDone, nightDone, priCompleted, actCompleted, commonWords },
    insufficientData: false,
  };
}

function generalSummary(
  entries: (DailyEntry & { priorities: any[]; action_steps: any[] })[],
  range: { start: string; end: string },
): InsightResponse {
  const morningMoods = entries.filter((e) => e.morning_mood).map((e) => e.morning_mood!);
  const nightMoods = entries.filter((e) => e.night_mood).map((e) => e.night_mood!);
  const topMorning = morningMoods.length > 0 ? mode(morningMoods) : 'N/A';
  const topNight = nightMoods.length > 0 ? mode(nightMoods) : 'N/A';
  const avgWater = entries.length > 0
    ? (entries.reduce((s, e) => s + e.water_count, 0) / entries.length).toFixed(1) : '0';

  const morningDone = entries.filter((e) => e.morning_completed).length;
  const nightDone = entries.filter((e) => e.night_completed).length;

  let summary = `📋 Summary (${range.start} to ${range.end})\n\n`;
  summary += `You have ${entries.length} entries in this period.\n\n`;
  summary += `☀️ Most common morning mood: ${topMorning}\n`;
  summary += `🌙 Most common night mood: ${topNight}\n`;
  summary += `💧 Average water intake: ${avgWater} glasses/day\n`;
  summary += `☀️ Morning check-ins: ${morningDone}/${entries.length}\n`;
  summary += `🌙 Night check-ins: ${nightDone}/${entries.length}\n`;

  return {
    dateRange: range,
    summary,
    stats: { topMorning, topNight, avgWater, morningDone, nightDone },
    insufficientData: false,
  };
}

/* ===== Helpers ===== */

function countOccurrences(arr: string[]): Record<string, number> {
  return arr.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {} as Record<string, number>);
}

function mode(arr: string[]): string {
  const freq = countOccurrences(arr);
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
}

function pct(num: number, total: number): string {
  if (total === 0) return '0%';
  return `${((num / total) * 100).toFixed(0)}%`;
}

function getTopWords(text: string, n: number): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'not',
    'so', 'if', 'then', 'than', 'just', 'about', 'up', 'out', 'no',
    'yes', 'more', 'also', 'very', 'really', 'today', 'tomorrow',
  ]);

  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const freq = countOccurrences(words);
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/* ===== Suggested questions ===== */

export const SUGGESTED_QUESTIONS = [
  'What things am I most grateful for?',
  'What makes my mood happy?',
  'What do you make of my recent brain dumps?',
  'What is the most common improvement I need to make?',
  'How are my morning reflections connected to my mood?',
  'Summarize my wins and achievements.',
];
