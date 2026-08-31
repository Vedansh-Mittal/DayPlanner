import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are the private insights assistant inside Daylight Planner, a personal daily journaling app. You are answering ONE specific question from the person who wrote every entry you're about to read. Nobody else will ever see this data.

You will be given:
- A date range describing which of their entries are included below.
- Pre-computed statistics (averages, counts, distributions) for that range — these numbers are already correct; use them as-is, never recompute or guess a number that isn't given to you.
- Raw entry text: daily notes, brain dumps, priorities, gratitude, wins, and reflections, each labeled with its date.
- Their question.

Rules, in priority order:

1. GROUND EVERYTHING IN THE PROVIDED DATA. Never invent a date, quote, number, or pattern that isn't actually present in what you were given. If you're not sure something is supported by the data, don't say it.

2. IF THE DATA CAN'T ANSWER THE QUESTION, SAY SO PLAINLY. Examples: the question asks about a time period outside the given range ("since I started" but you only have 30 days) — say what range you actually have. The question asks about a field they've never filled in — say they haven't logged that yet, don't paper over it. Do not force an answer from thin data.

3. NEVER CLAIM CAUSATION. If you notice two things moving together (e.g. mood and sleep, or a recurring word in brain dumps and mood), describe it as an observation in their own logged data, not a cause. Phrases like "on days when X, you tended to log Y" are fine; "X causes Y" or "X is why you feel Y" are not.

4. NO MEDICAL, THERAPEUTIC, OR DIAGNOSTIC LANGUAGE. Never label what they're experiencing with a clinical term (e.g. "this sounds like anxiety/burnout"), never give medical or therapy advice, and never draw conclusions from medication data even if it's present. If a question veers toward needing professional support, you can gently note that without diagnosing anything.

5. ANSWER THE ACTUAL QUESTION FIRST, in the first sentence or two. Then support it with brief, specific evidence — a date, a short paraphrase (not a long quote) of what they wrote, or a number from the stats you were given. Don't pad with generic openers like "Based on your data..." more than once, if at all.

6. BE CONCISE. Aim for roughly 100–180 words unless the question specifically asks for a list (e.g. "what are my most common themes") — then a short list is fine.

7. WRITE TO THEM DIRECTLY, warmly but plainly — like someone who has actually read their journal, not like a report generator. Never mention "the JSON," "the data provided," or any system mechanics. Never refer to yourself analyzing anything; just answer.

8. IF THE QUESTION ISN'T ABOUT THEIR JOURNAL AT ALL, gently redirect: say you can only answer questions about what they've logged in Daylight Planner.`;

function parseDateRange(question: string): { start: string; end: string } {
  const now = new Date();
  const q = question.toLowerCase();

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);
  const subDays = (d: Date, days: number) => {
    const res = new Date(d);
    res.setDate(res.getDate() - days);
    return res;
  };

  if (q.includes('today')) {
    const todayStr = formatDate(now);
    return { start: todayStr, end: todayStr };
  }
  if (q.includes('yesterday')) {
    const yStr = formatDate(subDays(now, 1));
    return { start: yStr, end: yStr };
  }

  // Look for "last X days" or "past X days"
  const daysMatch = q.match(/(?:last|past)\s+(\d+)\s+days?/i);
  if (daysMatch) {
    const count = parseInt(daysMatch[1], 10);
    if (count > 0 && count <= 365) {
      return { start: formatDate(subDays(now, count)), end: formatDate(now) };
    }
  }

  if (q.includes('last week') || q.includes('past week') || q.includes('7 days')) {
    return { start: formatDate(subDays(now, 7)), end: formatDate(now) };
  }

  if (q.includes('last 2 weeks') || q.includes('past 2 weeks') || q.includes('14 days')) {
    return { start: formatDate(subDays(now, 14)), end: formatDate(now) };
  }

  if (q.includes('this month')) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: formatDate(startOfMonth), end: formatDate(now) };
  }

  if (q.includes('last month') || q.includes('past month')) {
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: formatDate(startOfLastMonth), end: formatDate(endOfLastMonth) };
  }

  // Default: last 30 days
  return { start: formatDate(subDays(now, 30)), end: formatDate(now) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { question, startDate: customStart, endDate: customEnd } = await req.json();

    if (!question || typeof question !== 'string') {
      return new Response(JSON.stringify({ error: 'Question is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const range = (customStart && customEnd) 
      ? { start: customStart, end: customEnd } 
      : parseDateRange(question);

    // Fetch daily entries
    const { data: rawEntries, error: dbError } = await supabase
      .from('daily_entries')
      .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*)')
      .eq('user_id', user.id)
      .gte('entry_date', range.start)
      .lte('entry_date', range.end)
      .order('entry_date', { ascending: true });

    if (dbError) {
      console.error('Database query error:', dbError);
      return new Response(JSON.stringify({ error: 'Failed to fetch planner entries' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const entries = rawEntries || [];

    if (entries.length === 0) {
      return new Response(JSON.stringify({
        summary: `I couldn't find any planner entries for the period ${range.start} to ${range.end}. Try logging a day or selecting another date range!`,
        dateRange: range,
        stats: { entryCount: 0 },
        insufficientData: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Compute Statistics ──────────────────────────────────────
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

    const computedStats = {
      entryCount: entries.length,
      avgWaterGlasses: waterLoggedDays > 0 ? (totalWater / waterLoggedDays).toFixed(1) : 'N/A',
      avgMorningMoodScore: morningCount > 0 ? (totalMorningScore / morningCount).toFixed(1) + '/5' : 'N/A',
      avgNightMoodScore: nightCount > 0 ? (totalNightScore / nightCount).toFixed(1) + '/5' : 'N/A',
      morningMoodDistribution: morningMoodDist,
      nightMoodDistribution: nightMoodDist,
      prioritiesCompletedRatio: totalPriorities > 0 ? `${completedPriorities}/${totalPriorities}` : 'N/A',
      actionStepsCompletedRatio: totalActionSteps > 0 ? `${completedActionSteps}/${totalActionSteps}` : 'N/A',
    };

    // ── Format Entries Text ─────────────────────────────────────
    const formattedEntries = entries.map((e) => {
      const parts: string[] = [];
      parts.push(`--- DATE: ${e.entry_date} ---`);
      if (e.daily_note) parts.push(`Daily Note: ${e.daily_note}`);
      
      // Morning
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

      // Day / Habits
      if (e.water_count != null) parts.push(`Water Intake: ${e.water_count} glasses`);
      if (Array.isArray(e.meals) && e.meals.length) {
        const mList = e.meals.map((m: any) => `${m.meal_type}: ${m.ate ? (m.time ? `Ate at ${m.time}` : 'Ate') : 'Skipped'}${m.notes ? ` (${m.notes})` : ''}`);
        parts.push(`Meals: ${mList.join('; ')}`);
      }

      // Night
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

    // ── Call Gemini API if available ────────────────────────────
    if (!geminiApiKey) {
      return new Response(JSON.stringify({
        summary: `⚠️ Gemini API Key is not yet configured in Supabase Edge Functions. Please add GEMINI_API_KEY in your Supabase Dashboard Secrets.\n\nQuick Stats for ${range.start} to ${range.end}:\n• Entries: ${computedStats.entryCount}\n• Avg Water: ${computedStats.avgWaterGlasses} glasses\n• Avg Morning Mood: ${computedStats.avgMorningMoodScore}\n• Avg Night Mood: ${computedStats.avgNightMoodScore}`,
        dateRange: range,
        stats: computedStats,
        insufficientData: false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = `DATE RANGE: ${range.start} to ${range.end} (${entries.length} entries)

STATISTICS:
${JSON.stringify(computedStats, null, 2)}

ENTRIES:
${formattedEntries}

QUESTION: ${question}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`;

    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 600,
      },
    };

    let geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent?key=${geminiApiKey}`;
      geminiRes = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API call error:', errText);
      return new Response(JSON.stringify({
        error: `AI generation failed: ${geminiRes.statusText}`,
        details: errText,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const answerText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No insight could be generated.';

    return new Response(JSON.stringify({
      summary: answerText,
      dateRange: range,
      stats: computedStats,
      insufficientData: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Unhandled Edge Function error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
