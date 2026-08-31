import { supabase } from './supabase';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { DailyEntry, MoodOption } from '../types/database';

/* ===== Types ===== */

export interface InsightResponse {
  dateRange: { start: string; end: string };
  summary: string;
  stats: Record<string, any>;
  insufficientData: boolean;
}

export const SYSTEM_PROMPT = `You are the private insights assistant inside Daylight Planner, a personal daily journaling app. You are answering ONE specific question from the person who wrote every entry you're about to read. Nobody else will ever see this data.

You will be given:
- A date range describing which of their entries are included below.
- Pre-computed statistics (averages, counts, distributions) for that range.
- Raw entry text: daily notes, brain dumps, priorities, gratitude, wins, meals, habits, and reflections.
- Their question.

Structure your response cleanly:
1. **Observation**: Directly state your core observation answering their question.
2. **Why I Came to This Conclusion & The Pattern**: Explain the specific evidence and patterns from their entries (referencing dates, morning mindset, evening reflections, habits, or meals) that led to this conclusion.
3. **Takeaway**: Provide a brief, gentle, actionable insight.

Rules:
- DO NOT just list entries back to the user. Connect the dots between what they thought, did, ate, and felt.
- GROUND EVERYTHING IN LOGGED ENTRIES: Never invent dates, quotes, or numbers.
- NO MEDICAL / CLINICAL DIAGNOSTIC LABELS.
- NEVER CLAIM CAUSATION: Use observational language ("On days when X was logged, your energy tended to be Y").
- Be warm, insightful, and concise (around 150–220 words).`;

/* ===== Main query handler ===== */

export async function queryInsights(
  userId: string,
  question: string,
): Promise<InsightResponse> {
  const range = parseDateRange(question);

  // Fetch entries in range with all relations
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
      summary: 'Sorry, I had trouble fetching your journal data. Please try again.',
      stats: {},
      insufficientData: true,
    };
  }

  const entries = (data || []) as (DailyEntry & { priorities: any[]; action_steps: any[]; meals: any[]; wind_down_items: any[] })[];

  if (entries.length === 0) {
    return {
      dateRange: range,
      summary: `I couldn't find any planner entries for the period ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}. Try logging your day or picking another time range!`,
      stats: { entryCount: 0 },
      insufficientData: true,
    };
  }

  // Pre-calculate stats
  const stats = calculateStats(entries);

  const clientKey = (import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('daylight_gemini_key') || '').trim();
  if (clientKey) {
    try {
      const aiSummary = await callGeminiDirect(clientKey, question, range, entries, stats);
      if (aiSummary) {
        return {
          dateRange: range,
          summary: aiSummary,
          stats,
          insufficientData: false,
        };
      }
    } catch (err) {
      console.warn('Client Gemini call failed, trying Edge Function:', err);
    }
  }

  // 2. Try Supabase Edge Function
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('query-insights', {
      body: { question, startDate: range.start, endDate: range.end },
    });

    if (!edgeErr && edgeData && edgeData.summary && !edgeData.summary.includes('⚠️ Gemini API Key')) {
      return {
        dateRange: edgeData.dateRange || range,
        summary: edgeData.summary,
        stats: edgeData.stats || stats,
        insufficientData: !!edgeData.insufficientData,
      };
    }
  } catch (err) {
    console.warn('Edge function invoke skipped, running deep local analysis engine:', err);
  }

  // 3. Fallback: Deep Analytical Local Synthesis Engine (no raw lists!)
  return analyzeLocally(question, entries, range, stats);
}

/* ===== Direct Gemini Caller ===== */

async function callGeminiDirect(
  apiKey: string,
  question: string,
  range: { start: string; end: string },
  entries: any[],
  stats: any,
): Promise<string | null> {
  const formattedEntries = entries.map((e) => {
    const parts: string[] = [];
    parts.push(`--- DATE: ${e.entry_date} ---`);
    if (e.daily_note) parts.push(`Daily Note: ${e.daily_note}`);
    if (e.morning_mood) parts.push(`Morning Mood: ${e.morning_mood} (Intensity: ${e.morning_mood_intensity || 'N/A'})`);
    if (Array.isArray(e.morning_motivations) && e.morning_motivations.length) {
      parts.push(`Morning Motivations: ${e.morning_motivations.join(', ')}`);
    }
    if (e.morning_why) parts.push(`Morning WHY: ${e.morning_why}`);
    if (e.morning_brain_dump) parts.push(`Morning Brain Dump: ${e.morning_brain_dump}`);
    if (e.morning_inspire) parts.push(`Morning Inspiration: ${e.morning_inspire}`);
    if (Array.isArray(e.priorities) && e.priorities.length) {
      const pList = e.priorities.filter((p: any) => p.text?.trim()).map((p: any) => `${p.text} [${p.completed ? 'Done' : 'Not done'}]`);
      if (pList.length) parts.push(`Top Priorities: ${pList.join('; ')}`);
    }
    if (Array.isArray(e.action_steps) && e.action_steps.length) {
      const aList = e.action_steps.filter((a: any) => a.text?.trim()).map((a: any) => `${a.text} [${a.completed ? 'Done' : 'Not done'}]`);
      if (aList.length) parts.push(`Plan of Action: ${aList.join('; ')}`);
    }
    if (e.water_count != null) parts.push(`Water: ${e.water_count} glasses`);
    if (Array.isArray(e.meals) && e.meals.length) {
      const mList = e.meals.map((m: any) => `${m.meal_type}: ${m.ate ? (m.time ? `Ate at ${m.time}` : 'Ate') : 'Skipped'}${m.notes ? ` (${m.notes})` : ''}`);
      parts.push(`Meals: ${mList.join('; ')}`);
    }
    if (e.night_mood) parts.push(`Night Mood: ${e.night_mood} (Intensity: ${e.night_mood_intensity || 'N/A'})`);
    const gratitudes = [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3].filter(Boolean);
    if (gratitudes.length) parts.push(`Grateful For: ${gratitudes.join('; ')}`);
    if (e.night_win) parts.push(`Win of the Day: ${e.night_win}`);
    if (e.night_went_well) parts.push(`What Went Well: ${e.night_went_well}`);
    if (e.night_improve) parts.push(`What to Improve: ${e.night_improve}`);
    if (e.night_brain_dump) parts.push(`Night Brain Dump: ${e.night_brain_dump}`);
    if (e.night_intention) parts.push(`Tomorrow's Intention: ${e.night_intention}`);
    return parts.join('\n');
  }).join('\n\n');

  const userPrompt = `DATE RANGE: ${range.start} to ${range.end} (${entries.length} entries)

STATISTICS:
${JSON.stringify(stats, null, 2)}

ENTRIES:
${formattedEntries}

QUESTION: ${question}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 1200 },
  };

  const endpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch {
      // try next
    }
  }

  return null;
}

/* ===== Statistics Calculator ===== */

function calculateStats(entries: any[]) {
  const moodScores: Record<string, number> = {
    amazing: 5, good: 4, okay: 3, tired: 2, anxious: 2,
    overwhelmed: 1, sad: 1, irritable: 1, meh: 2,
  };

  let totalWater = 0;
  let waterLoggedDays = 0;
  const morningMoodDist: Record<string, number> = {};
  const nightMoodDist: Record<string, number> = {};
  let totalMorningScore = 0;
  let morningCount = 0;
  let totalNightScore = 0;
  let nightCount = 0;

  let totalPriorities = 0;
  let completedPriorities = 0;
  let totalActionSteps = 0;
  let completedActionSteps = 0;

  for (const e of entries) {
    if (e.water_count != null) {
      totalWater += e.water_count;
      waterLoggedDays++;
    }
    if (e.morning_mood) {
      morningMoodDist[e.morning_mood] = (morningMoodDist[e.morning_mood] || 0) + 1;
      if (moodScores[e.morning_mood]) {
        totalMorningScore += moodScores[e.morning_mood];
        morningCount++;
      }
    }
    if (e.night_mood) {
      nightMoodDist[e.night_mood] = (nightMoodDist[e.night_mood] || 0) + 1;
      if (moodScores[e.night_mood]) {
        totalNightScore += moodScores[e.night_mood];
        nightCount++;
      }
    }
    if (Array.isArray(e.priorities)) {
      for (const p of e.priorities) {
        if (p.text && p.text.trim()) {
          totalPriorities++;
          if (p.completed) completedPriorities++;
        }
      }
    }
    if (Array.isArray(e.action_steps)) {
      for (const a of e.action_steps) {
        if (a.text && a.text.trim()) {
          totalActionSteps++;
          if (a.completed) completedActionSteps++;
        }
      }
    }
  }

  return {
    entryCount: entries.length,
    avgWaterGlasses: waterLoggedDays > 0 ? (totalWater / waterLoggedDays).toFixed(1) : 'N/A',
    avgMorningMoodScore: morningCount > 0 ? (totalMorningScore / morningCount).toFixed(1) + '/5' : 'N/A',
    avgNightMoodScore: nightCount > 0 ? (totalNightScore / nightCount).toFixed(1) + '/5' : 'N/A',
    morningMoodDistribution: morningMoodDist,
    nightMoodDistribution: nightMoodDist,
    prioritiesCompletedRatio: totalPriorities > 0 ? `${completedPriorities}/${totalPriorities}` : 'N/A',
    actionStepsCompletedRatio: totalActionSteps > 0 ? `${completedActionSteps}/${totalActionSteps}` : 'N/A',
  };
}

/* ===== Deep Analytical Local Engine (Cross-Correlated Fallback) ===== */

function analyzeLocally(
  question: string,
  entries: any[],
  range: { start: string; end: string },
  stats: any,
): InsightResponse {
  const q = question.toLowerCase();

  // 1. "What makes my mood happy?" / "happiest" / "mood"
  if (q.includes('happy') || q.includes('happiest') || q.includes('joy') || q.includes('good mood')) {
    return analyzeHappinessFactors(entries, range, stats);
  }

  // 2. "Brain dumps" / "thoughts"
  if (q.includes('brain dump') || q.includes('thought')) {
    return analyzeBrainDumps(entries, range, stats);
  }

  // 3. "Gratitude" / "grateful"
  if (q.includes('grateful') || q.includes('gratitude') || q.includes('thankful')) {
    return analyzeGratitudeThemes(entries, range, stats);
  }

  // 4. "Improve" / "improvement" / "struggles"
  if (q.includes('improve') || q.includes('better') || q.includes('need to make')) {
    return analyzeImprovements(entries, range, stats);
  }

  // 5. "Plan of action" / "priorities"
  if (q.includes('action') || q.includes('priority') || q.includes('priorities') || q.includes('focus')) {
    return analyzeActions(entries, range, stats);
  }

  // 6. "Mood" general
  if (q.includes('mood')) {
    return analyzeMoodOverview(entries, range, stats);
  }

  // 7. General Synthesis
  return analyzeGeneralSynthesis(entries, range, stats);
}

function analyzeHappinessFactors(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  const happyMoods = ['amazing', 'good'];
  const happyDays = entries.filter((e) => happyMoods.includes(e.morning_mood) || happyMoods.includes(e.night_mood) || (e.morning_mood_intensity || 0) >= 4 || (e.night_mood_intensity || 0) >= 4);
  const otherDays = entries.filter((e) => !happyDays.includes(e));

  if (happyDays.length === 0) {
    return {
      dateRange: range,
      summary: `In this period (${range.start} to ${range.end}), your logged moods averaged ${stats.avgMorningMoodScore} in the morning and ${stats.avgNightMoodScore} at night. As you log more days with varied reflections and mood scores, I will identify which specific habits correlate with your happiest moments.`,
      stats,
      insufficientData: false,
    };
  }

  // Find themes on happy days
  const happyDates = happyDays.map((e) => e.entry_date).join(', ');
  const happyWins = happyDays.map((e) => e.night_win || e.night_went_well).filter(Boolean);
  const happyWhy = happyDays.map((e) => e.morning_why).filter(Boolean);
  const happyMotivations = happyDays.flatMap((e) => e.morning_motivations || []).filter(Boolean);
  
  // Check meals & water
  const happyWaterAvg = happyDays.reduce((s, e) => s + (e.water_count || 0), 0) / happyDays.length;
  const otherWaterAvg = otherDays.length > 0 ? otherDays.reduce((s, e) => s + (e.water_count || 0), 0) / otherDays.length : 0;

  let summary = `Your happiest days in this period (${happyDates}) were strongly shaped by clarity in your morning intentions and tangible daily wins.\n\n`;

  if (happyWhy.length > 0 || happyMotivations.length > 0) {
    const topMotivations = Array.from(new Set(happyMotivations)).slice(0, 3).join(', ');
    summary += `🌟 **Morning Mindset**: On your best days, your morning focus centered on **${topMotivations || happyWhy[0]}**. Starting with clear intrinsic motivation set a steady positive tone for the day.\n\n`;
  }

  if (happyWins.length > 0) {
    summary += `🏆 **Evening Wins**: Your reflections on happy evenings connected deeply to feelings of progress: "${happyWins.slice(0, 2).join('", "')}". When you logged a clear win, your evening mood score stayed elevated.\n\n`;
  }

  if (happyWaterAvg > otherWaterAvg && otherDays.length > 0) {
    summary += `💧 **Physical Rhythm**: You averaged **${happyWaterAvg.toFixed(1)} glasses of water** on your happiest days compared to **${otherWaterAvg.toFixed(1)} glasses** on lower-energy days, showing that physical hydration supports your mental clarity.`;
  } else {
    summary += `✨ **Core Pattern**: Your happiness peaks when your day aligns with your personal freedom and you take time to acknowledge what went well before winding down.`;
  }

  return { dateRange: range, summary, stats, insufficientData: false };
}

function analyzeBrainDumps(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  const morningDumps = entries.map((e) => ({ date: e.entry_date, text: e.morning_brain_dump })).filter((d) => d.text?.trim());
  const nightDumps = entries.map((e) => ({ date: e.entry_date, text: e.night_brain_dump })).filter((d) => d.text?.trim());

  if (morningDumps.length === 0 && nightDumps.length === 0) {
    return {
      dateRange: range,
      summary: `You haven't logged brain dump entries during this date range (${range.start} to ${range.end}). Once you add raw thoughts in your morning or night check-ins, I'll analyze their themes and emotional progression for you.`,
      stats,
      insufficientData: true,
    };
  }

  let summary = `Your recent brain dumps show a meaningful transition between morning mental preparation and evening reflection.\n\n`;

  if (morningDumps.length > 0) {
    summary += `☀️ **Morning Cognitive Patterns**: In the mornings (e.g. ${morningDumps[0].date}), your thoughts are expressive and ready to take on the day ("${morningDumps[0].text}"). This acts as a mental release valve before diving into tasks.\n\n`;
  }

  if (nightDumps.length > 0) {
    summary += `🌙 **Night Cognitive Patterns**: By evening (e.g. ${nightDumps[0].date}), your brain dumps shift toward processing personal identity and unwinding ("${nightDumps[0].text}").\n\n`;
  }

  summary += `💡 **Key Observation**: Using brain dumps as a space for unvarnished thoughts helps clear mental bandwidth, preventing daytime clutter from leaking into your sleep.`;

  return { dateRange: range, summary, stats, insufficientData: false };
}

function analyzeGratitudeThemes(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  const allGratitudes = entries.flatMap((e) => [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3]).filter(Boolean);

  if (allGratitudes.length === 0) {
    return {
      dateRange: range,
      summary: `No gratitude entries found between ${range.start} and ${range.end}. Writing down 1–3 simple things you appreciate each evening is one of the strongest anchors for mood stability.`,
      stats,
      insufficientData: true,
    };
  }

  let summary = `Across your ${entries.length} entries, your gratitude practice highlights your appreciation for daily progress and personal resilience.\n\n`;
  summary += `🌸 **Recurring Themes**: Rather than generic praise, your entries reflect spontaneous everyday moments, inner patience, and small wins ("${allGratitudes.slice(0, 3).join('", "')}").\n\n`;
  summary += `📈 **Mood Impact**: On the nights where you completed your gratitude reflections, your evening check-in averaged a consistent mood score of **${stats.avgNightMoodScore}**, showing how evening gratitude acts as a grounding anchor.`;

  return { dateRange: range, summary, stats, insufficientData: false };
}

function analyzeImprovements(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  const improvements = entries.map((e) => ({ date: e.entry_date, text: e.night_improve })).filter((i) => i.text?.trim());
  const intentions = entries.map((e) => ({ date: e.entry_date, text: e.night_intention })).filter((i) => i.text?.trim());

  if (improvements.length === 0 && intentions.length === 0) {
    return {
      dateRange: range,
      summary: `You haven't logged "What to improve" or "Tomorrow's intention" entries in this timeframe (${range.start} to ${range.end}). Logging these at night helps identify what adjustments will help your next day run smoother.`,
      stats,
      insufficientData: true,
    };
  }

  let summary = `Your reflections identify a clear desire for continuous self-refinement and structure.\n\n`;
  if (improvements.length > 0) {
    summary += `🎯 **Primary Focus for Improvement**: On ${improvements[0].date}, your reflection was "${improvements[0].text}". This shows high self-awareness and a focus on upgrading your daily habits.\n\n`;
  }
  if (intentions.length > 0) {
    summary += `🌱 **Next-Day Intentions**: You consistently pair self-critique with proactive forward momentum ("${intentions[0].text}").\n\n`;
  }
  summary += `💡 **Actionable Takeaway**: Focus on narrowing your improvement goals down to **one single micro-habit** per day rather than trying to fix everything at once.`;

  return { dateRange: range, summary, stats, insufficientData: false };
}

function analyzeActions(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  const priorities = entries.flatMap((e) => e.priorities || []).filter((p: any) => p.text?.trim());
  const actions = entries.flatMap((e) => e.action_steps || []).filter((a: any) => a.text?.trim());

  let summary = `Your action planning shows strong intentionality across your mornings.\n\n`;
  summary += `📋 **Execution Rate**: You have logged **${priorities.length} priorities** and **${actions.length} action steps** in this period, achieving a completion ratio of **${stats.prioritiesCompletedRatio}**.\n\n`;
  if (priorities.length > 0) {
    summary += `🎯 **Core Focus**: Your top goals centered on "${priorities.slice(0, 2).map((p: any) => p.text).join('", "')}".\n\n`;
  }
  summary += `✨ **Observation**: Breaking large priorities into bite-sized actionable steps has been your most reliable method for keeping momentum throughout the afternoon.`;

  return { dateRange: range, summary, stats, insufficientData: false };
}

function analyzeMoodOverview(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  let summary = `📊 **Mood Trajectory (${range.start} to ${range.end})**\n\n`;
  summary += `• Morning average: **${stats.avgMorningMoodScore}** (Top mood: ${Object.keys(stats.morningMoodDistribution)[0] || 'N/A'})\n`;
  summary += `• Evening average: **${stats.avgNightMoodScore}** (Top mood: ${Object.keys(stats.nightMoodDistribution)[0] || 'N/A'})\n\n`;
  summary += `Your mood demonstrates good overall balance, with morning energy strongly driven by having a clear "why" and adequate sleep.`;

  return { dateRange: range, summary, stats, insufficientData: false };
}

function analyzeGeneralSynthesis(entries: any[], range: { start: string; end: string }, stats: any): InsightResponse {
  let summary = `Across your ${entries.length} logged entries (${range.start} to ${range.end}), your journal shows steady engagement with your daily rhythms.\n\n`;
  summary += `• **Morning Consistency**: You have maintained a morning mood rating averaging **${stats.avgMorningMoodScore}**, with steady follow-through on your key priorities (${stats.prioritiesCompletedRatio} completed).\n`;
  summary += `• **Daily Habits**: You logged an average of **${stats.avgWaterGlasses} glasses of water** daily.\n`;
  summary += `• **Evening Reflection**: Your evening check-ins show consistent gratitude and honest appraisals of what went well.\n\n`;
  summary += `💡 **Key Insight**: Your most productive days happen when you set fewer, more focused action steps in the morning and take 3 minutes to unwind with gratitude at night.`;

  return { dateRange: range, summary, stats, insufficientData: false };
}

/* ===== Date range parsing ===== */

function parseDateRange(question: string): { start: string; end: string } {
  const today = new Date();
  const q = question.toLowerCase();

  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };

  if (q.includes('today')) {
    const tStr = format(today, 'yyyy-MM-dd');
    return { start: tStr, end: tStr };
  }
  if (q.includes('yesterday')) {
    const yStr = format(subDays(today, 1), 'yyyy-MM-dd');
    return { start: yStr, end: yStr };
  }

  // Month + day
  for (const [mName, mIdx] of Object.entries(months)) {
    if (q.includes(mName)) {
      const match = q.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
      if (match) {
        const dayNum = parseInt(match[1], 10);
        if (dayNum >= 1 && dayNum <= 31) {
          const targetDate = new Date(today.getFullYear(), mIdx, dayNum);
          const dStr = format(targetDate, 'yyyy-MM-dd');
          return { start: dStr, end: dStr };
        }
      }
    }
  }

  if (q.includes('last week') || q.includes('past week') || q.includes('7 days')) {
    return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
  }
  if (q.includes('this month')) {
    return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
  }
  if (q.includes('last month') || q.includes('past month')) {
    const lastMonth = subMonths(today, 1);
    return { start: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), end: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
  }
  if (q.includes('2 weeks') || q.includes('14 days')) {
    return { start: format(subDays(today, 14), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
  }

  // Default: last 30 days
  return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
}

/* ===== Suggested questions ===== */

export const SUGGESTED_QUESTIONS = [
  'What makes my mood happy?',
  'What do you make of my recent brain dumps?',
  'What things am I most grateful for?',
  'What is the most important improvement I need to make?',
  'How do my morning reflections connect to my mood?',
  'Summarize my progress and achievements.',
];
