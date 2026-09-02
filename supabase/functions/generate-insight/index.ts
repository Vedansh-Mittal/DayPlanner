import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ── CORS ────────────────────────────────────────────────────── */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ── Mood scoring ────────────────────────────────────────────── */
const MOOD_SCORES: Record<string, number> = {
  amazing: 5, good: 4, okay: 3, tired: 2, anxious: 2,
  overwhelmed: 1, sad: 1, irritable: 1, meh: 2,
};

/* ── Rate limiter (10 per user per 24 hours) ─────────────────── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

/* ── Evidence ID generation ──────────────────────────────────── */
interface EvidenceItem {
  id: string;
  date: string;
  field: string;
  label: string;
  snippet: string;
}

function buildEvidenceMap(entries: any[]): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  for (const e of entries) {
    const d = e.entry_date;
    const add = (field: string, label: string, snippet: string) => {
      if (snippet && String(snippet).trim()) {
        evidence.push({
          id: `EVD-${d}-${field}`,
          date: d,
          field,
          label,
          snippet: String(snippet).slice(0, 400),
        });
      }
    };

    if (e.morning_mood) add('MOOD-MORN', 'Morning Mood', `${e.morning_mood} (intensity: ${e.morning_mood_intensity ?? 'N/A'})`);
    if (e.night_mood) add('MOOD-NIGHT', 'Night Mood', `${e.night_mood} (intensity: ${e.night_mood_intensity ?? 'N/A'})`);
    if (e.daily_note) add('NOTE', 'Daily Note', e.daily_note);
    if (e.morning_why) add('WHY', 'Morning Why', e.morning_why);
    if (e.morning_brain_dump) add('BRAIN-MORN', 'Morning Brain Dump', e.morning_brain_dump);
    if (e.morning_inspire) add('INSPIRE', 'Morning Inspiration', e.morning_inspire);
    if (Array.isArray(e.morning_motivations) && e.morning_motivations.length) {
      add('MOTIVATION', 'Motivations', e.morning_motivations.join(', '));
    }
    if (e.night_brain_dump) add('BRAIN-NIGHT', 'Night Brain Dump', e.night_brain_dump);
    if (e.night_win) add('WIN', 'Win of the Day', e.night_win);
    if (e.night_went_well) add('WELL', 'What Went Well', e.night_went_well);
    if (e.night_improve) add('IMPROVE', 'What to Improve', e.night_improve);
    if (e.night_intention) add('INTENTION', 'Tomorrow Intention', e.night_intention);
    const gratitudes = [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3].filter(Boolean);
    if (gratitudes.length) add('GRATITUDE', 'Gratitude', gratitudes.join('; '));
    if (e.water_count != null) add('WATER', 'Water Intake', `${e.water_count} glasses`);

    if (Array.isArray(e.priorities)) {
      const pTexts = e.priorities.filter((p: any) => p.text?.trim()).map((p: any) => `${p.text} [${p.completed ? 'Done' : 'Not done'}]`);
      if (pTexts.length) add('PRIORITIES', 'Top Priorities', pTexts.join('; '));
    }
    if (Array.isArray(e.action_steps)) {
      const aTexts = e.action_steps.filter((a: any) => a.text?.trim()).map((a: any) => `${a.text} [${a.completed ? 'Done' : 'Not done'}]`);
      if (aTexts.length) add('ACTIONS', 'Action Steps', aTexts.join('; '));
    }
    if (Array.isArray(e.medications)) {
      const medTexts = e.medications
        .filter((m: any) => m && m.name?.trim())
        .map((m: any) => `${m.name}${m.dose ? ` (${m.dose})` : ''}${m.time ? ` at ${m.time}` : ''} [${m.taken ? 'Taken' : 'Not taken'}]`);
      if (medTexts.length) add('MEDS', 'Medications', medTexts.join('; '));
    }
    if (e.medication_notes) add('MED-NOTES', 'Medication Notes', e.medication_notes);
    if (Array.isArray(e.meals)) {
      const mealTexts = e.meals.map((m: any) => `${m.meal_type}: ${m.ate ? (m.time ? `Ate at ${m.time}` : 'Ate') : 'Skipped'}${m.notes ? ` (${m.notes})` : ''}`);
      if (mealTexts.length) add('MEALS', 'Meals', mealTexts.join('; '));
    }
  }

  return evidence;
}

/* ── Statistics calculator ───────────────────────────────────── */
function calculateStats(entries: any[]) {
  let totalWater = 0, waterDays = 0;
  let mornScoreSum = 0, mornCount = 0;
  let nightScoreSum = 0, nightCount = 0;
  const mornDist: Record<string, number> = {};
  const nightDist: Record<string, number> = {};
  let totalPri = 0, donePri = 0;
  let totalAct = 0, doneAct = 0;
  let morningCheckins = 0, nightCheckins = 0;

  for (const e of entries) {
    if (e.water_count != null) { totalWater += e.water_count; waterDays++; }
    if (e.morning_mood) {
      morningCheckins++;
      mornDist[e.morning_mood] = (mornDist[e.morning_mood] || 0) + 1;
      if (MOOD_SCORES[e.morning_mood]) { mornScoreSum += MOOD_SCORES[e.morning_mood]; mornCount++; }
    }
    if (e.night_mood) {
      nightCheckins++;
      nightDist[e.night_mood] = (nightDist[e.night_mood] || 0) + 1;
      if (MOOD_SCORES[e.night_mood]) { nightScoreSum += MOOD_SCORES[e.night_mood]; nightCount++; }
    }
    if (Array.isArray(e.priorities)) {
      for (const p of e.priorities) { if (p.text?.trim()) { totalPri++; if (p.completed) donePri++; } }
    }
    if (Array.isArray(e.action_steps)) {
      for (const a of e.action_steps) { if (a.text?.trim()) { totalAct++; if (a.completed) doneAct++; } }
    }
  }

  return {
    entryCount: entries.length,
    morningCheckins,
    nightCheckins,
    avgWaterGlasses: waterDays > 0 ? +(totalWater / waterDays).toFixed(1) : null,
    waterLoggedDays: waterDays,
    avgMorningMoodScore: mornCount > 0 ? +(mornScoreSum / mornCount).toFixed(2) : null,
    avgNightMoodScore: nightCount > 0 ? +(nightScoreSum / nightCount).toFixed(2) : null,
    morningMoodDistribution: mornDist,
    nightMoodDistribution: nightDist,
    prioritiesTotal: totalPri,
    prioritiesCompleted: donePri,
    prioritiesCompletionRate: totalPri > 0 ? +(donePri / totalPri * 100).toFixed(1) : null,
    actionStepsTotal: totalAct,
    actionStepsCompleted: doneAct,
    actionStepsCompletionRate: totalAct > 0 ? +(doneAct / totalAct * 100).toFixed(1) : null,
  };
}

/* ── Warm, Human Fallback Synthesizer (when Gemini is offline) ─ */
function buildHumanFallback(question: string, entries: any[], range: { start: string; end: string }, stats: any): string {
  const q = question.toLowerCase();

  // 1. Brain dump lookup
  if (q.includes('brain dump') || q.includes('thought')) {
    const morningDumps = entries.filter((e) => e.morning_brain_dump?.trim()).map((e) => `• **${e.entry_date} (Morning)**: "${e.morning_brain_dump}"`);
    const nightDumps = entries.filter((e) => e.night_brain_dump?.trim()).map((e) => `• **${e.entry_date} (Night)**: "${e.night_brain_dump}"`);
    const all = [...morningDumps, ...nightDumps];
    if (all.length > 0) {
      return `🧠 **Your Brain Dump Entries (${range.start === range.end ? range.start : `${range.start} to ${range.end}`})**\n\n${all.join('\n\n')}\n\n💡 Writing out raw thoughts gives mental clarity and helps release lingering thoughts before rest.`;
    }
    return `You haven't logged any brain dumps for ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}. You can add unvarnished thoughts anytime in your Morning or Night check-in!`;
  }

  // 2. Medication / supplement lookup
  if (q.includes('medication') || q.includes('medicine') || q.includes('dosage') || q.includes('dose') || q.includes('vitamin') || q.includes('supplement') || q.includes('pill') || q.includes('dolo')) {
    const meds: string[] = [];
    entries.forEach((e) => {
      if (Array.isArray(e.medications) && e.medications.length) {
        e.medications.forEach((m: any) => {
          if (m && m.name?.trim()) {
            meds.push(`• **${e.entry_date}** — **${m.name}**${m.dose ? ` (${m.dose})` : ''}${m.time ? ` at ${m.time}` : ''}: ${m.taken ? '✅ Taken' : '⏳ Unticked'}`);
          }
        });
      }
    });
    if (meds.length > 0) {
      return `💊 **Medication & Supplement Logs (${range.start === range.end ? range.start : `${range.start} to ${range.end}`})**\n\n${meds.join('\n')}\n\n💡 Consistent tracking keeps your health habits steady and supported.`;
    }
    return `No medications or supplements were logged for ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}.`;
  }

  // 3. Gratitude lookup
  if (q.includes('grateful') || q.includes('gratitude') || q.includes('thankful')) {
    const grats: string[] = [];
    entries.forEach((e) => {
      const list = [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3].filter(Boolean);
      if (list.length) grats.push(`• **${e.entry_date}**: "${list.join('", "')}"`);
    });
    if (grats.length > 0) {
      return `🌸 **Moments of Gratitude (${range.start === range.end ? range.start : `${range.start} to ${range.end}`})**\n\n${grats.join('\n')}\n\n✨ Taking time to appreciate small moments anchors your evening in calm resilience.`;
    }
    return `No gratitude reflections were found for ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}.`;
  }

  // 4. Single entry general lookup
  if (entries.length === 1) {
    const e = entries[0];
    const details: string[] = [];
    if (e.morning_mood) details.push(`• Morning Mood: **${e.morning_mood}** ${e.morning_mood_intensity ? `(${e.morning_mood_intensity}/5)` : ''}`);
    if (e.morning_why) details.push(`• Morning Focus: "${e.morning_why}"`);
    if (e.morning_brain_dump) details.push(`• Morning Brain Dump: "${e.morning_brain_dump}"`);
    if (e.water_count != null) details.push(`• Water: **${e.water_count} glasses**`);
    if (e.night_mood) details.push(`• Night Mood: **${e.night_mood}** ${e.night_mood_intensity ? `(${e.night_mood_intensity}/5)` : ''}`);
    if (e.night_win) details.push(`• Daily Win: "${e.night_win}"`);
    if (e.night_brain_dump) details.push(`• Night Brain Dump: "${e.night_brain_dump}"`);
    return `📖 **Journal Entry for ${e.entry_date}**\n\n${details.join('\n') || 'Entry logged without notes.'}`;
  }

  // 5. Multi-entry general synthesis
  let text = `Across your ${entries.length} logged entries (${range.start} to ${range.end}), here is a gentle reflection on your rhythm:\n\n`;
  if (stats.avgMorningMoodScore) text += `• **Morning Mindset**: Your morning mood averaged **${stats.avgMorningMoodScore}/5**.\n`;
  if (stats.avgNightMoodScore) text += `• **Evening Reflection**: Your evening mood averaged **${stats.avgNightMoodScore}/5**.\n`;
  if (stats.avgWaterGlasses) text += `• **Hydration**: You averaged **${stats.avgWaterGlasses} glasses of water** daily.\n`;
  if (stats.prioritiesCompletionRate != null) text += `• **Focus**: You completed ${stats.prioritiesCompleted}/${stats.prioritiesTotal} priorities (${stats.prioritiesCompletionRate}%).\n`;
  text += `\n✨ Consistency with small daily habits is the foundation for lasting peace and clarity.`;
  return text;
}

/* ── Gemini System Prompt ────────────────────────────────────── */
const SYSTEM_PROMPT = `You are the private, compassionate journaling companion inside Daylight Planner. You are having an intimate, thoughtful reflection with the person who wrote these entries.

You will be given:
- A date range for the entries.
- Pre-computed statistics (averages, counts).
- Raw entry text: notes, brain dumps, priorities, gratitude, wins, meals, water, medications/supplements, and reflections.
- Evidence items with unique IDs [EVD-...].
- Their question.

VOICE & TONE:
- Write with genuine warmth, empathy, and clarity. Talk like a caring, observant close friend who genuinely listens and values their journey.
- Validate their feelings (e.g. recognizing when a day was exhausting, celebrating small wins, honoring their honesty).
- Directly answer their question in the first 1-2 sentences!
- If the question asks for a specific entry or topic (e.g. "brain dump on 1st september" or "my medications on aug 2"), focus specifically on that entry and provide an intimate, thoughtful answer.

FORMATTING GUIDELINES:
- Put any quoted phrases or specific words from the user in quotes, e.g. "tired", "feeling overwhelmed", "good progress".
- Break explanations into short, readable paragraphs (2-3 sentences each). If explaining multiple factors, use bullet points so it is effortless to read on mobile.
- Connect the dots between what they thought, did, ate, drank, and felt without jumping to clinical conclusions.
- If the user wrote conversational shorthand in medication logs like "again both", resolve it to mean the previous day's medications.
- Never invent activities, emotions, dates, quantities, or patterns not in the evidence.
- Respond in JSON format adhering to the schema.`;

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Warm, natural, compassionate answer directly answering the question (120-250 words)' },
    dateRange: { type: 'STRING', description: 'The date range analyzed' },
    claims: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'Key factual claim or observation from the journal' },
          evidenceIds: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Matching evidence IDs from the EVIDENCE section',
          },
        },
        required: ['text', 'evidenceIds'],
      },
      description: 'List of grounded claims with evidence IDs',
    },
    limitations: { type: 'STRING', description: 'Any caveats if data is sparse or fields unlogged' },
  },
  required: ['summary', 'dateRange', 'claims', 'limitations'],
};

/* ── Main Edge Function Handler ──────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized user token' }, 401);
    }

    const body = await req.json();
    const { question, startDate, endDate } = body;

    if (!question || typeof question !== 'string' || !startDate || !endDate) {
      return jsonResponse({ error: 'question, startDate, and endDate are required' }, 400);
    }

    const range = { start: startDate, end: endDate };

    // Rate limit check
    if (!checkRateLimit(user.id)) {
      return jsonResponse({
        type: 'rate-limited',
        summary: "You've reached your daily insight limit (10 per day). Your insights will reset tomorrow!",
        dateRange: range,
        stats: {},
        claims: [],
        evidenceMap: [],
        limitations: 'Rate limit reached.',
        isFallback: true,
      });
    }

    // Query user's data
    const { data: rawEntries, error: dbError } = await supabase
      .from('daily_entries')
      .select('*, priorities(*), action_steps(*), medications(*), meals(*), wind_down_items(*)')
      .eq('user_id', user.id)
      .gte('entry_date', range.start)
      .lte('entry_date', range.end)
      .order('entry_date', { ascending: true });

    if (dbError) {
      console.error('DB error:', dbError.message);
      return jsonResponse({ error: 'Failed to fetch planner entries' }, 500);
    }

    const entries = rawEntries || [];
    const stats = calculateStats(entries);

    // If 0 entries found
    if (entries.length === 0) {
      return jsonResponse({
        type: 'insufficient-data',
        summary: `I couldn't find any planner entries for ${range.start === range.end ? range.start : `${range.start} to ${range.end}`}. Try logging your day or selecting another date range!`,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: [],
        limitations: 'No entries found in the requested date range.',
        isFallback: false,
      });
    }

    // Trend check: ONLY if broad trend question AND fewer than 3 entries
    const qLower = question.toLowerCase();
    const isBroadTrendQuestion = /what makes (my|me) (happy|happiest)|trends?|monthly patterns?|how was my mood this month|overall progress/i.test(qLower);
    const isSingleDayOrSpecific = range.start === range.end || /brain dump|medication|supplement|note|win|gratitude|priority|action|breakfast|lunch|dinner|water/i.test(qLower);

    if (isBroadTrendQuestion && !isSingleDayOrSpecific && entries.length < 3) {
      return jsonResponse({
        type: 'insufficient-data',
        summary: `I found only ${entries.length} entry${entries.length === 1 ? '' : 'ies'} between ${range.start} and ${range.end}. To uncover meaningful patterns and trends, I need at least 3 completed entries. Keep journaling — your reflections will get richer!`,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: [],
        limitations: `Only ${entries.length} entries available; 3+ needed for long-term trend analysis.`,
        isFallback: false,
      });
    }

    const evidenceMap = buildEvidenceMap(entries);
    const validEvidenceIds = new Set(evidenceMap.map((e) => e.id));

    // Format full journal entries text for context
    const formattedEntries = entries.map((e) => {
      const parts: string[] = [];
      parts.push(`--- DATE: ${e.entry_date} ---`);
      if (e.daily_note) parts.push(`Daily Note: ${e.daily_note}`);
      if (e.morning_mood) parts.push(`Morning Mood: ${e.morning_mood} (Intensity: ${e.morning_mood_intensity || 'N/A'})`);
      if (Array.isArray(e.morning_motivations) && e.morning_motivations.length) parts.push(`Morning Motivations: ${e.morning_motivations.join(', ')}`);
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
      if (e.water_count != null) parts.push(`Water Intake: ${e.water_count} glasses`);
      if (Array.isArray(e.meals) && e.meals.length) {
        const mList = e.meals.map((m: any) => `${m.meal_type}: ${m.ate ? (m.time ? `Ate at ${m.time}` : 'Ate') : 'Skipped'}${m.notes ? ` (${m.notes})` : ''}`);
        parts.push(`Meals: ${mList.join('; ')}`);
      }
      if (Array.isArray(e.medications) && e.medications.length) {
        const medList = e.medications.filter((m: any) => m && m.name?.trim()).map((m: any) => `${m.name}${m.dose ? ` (${m.dose})` : ''}${m.time ? ` at ${m.time}` : ''} [${m.taken ? 'Taken' : 'Not taken'}]`);
        if (medList.length) parts.push(`Medications & Supplements: ${medList.join('; ')}`);
      }
      if (e.medication_notes) parts.push(`Medication Notes: ${e.medication_notes}`);
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

    const evidenceListText = evidenceMap.map((e) => `[${e.id}] ${e.label} on ${e.date}: ${e.snippet}`).join('\n');

    const userPrompt = `DATE RANGE: ${range.start} to ${range.end} (${entries.length} entries)

STATISTICS:
${JSON.stringify(stats, null, 2)}

FULL JOURNAL ENTRIES:
${formattedEntries}

EVIDENCE ITEMS FOR CITATION:
${evidenceListText}

QUESTION: ${question}`;

    // Call Gemini with model fallbacks (gemini-3.6-flash, gemini-3.5-flash-lite, gemini-flash-lite-latest)
    const modelCandidates = [
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ];

    let geminiRes: Response | null = null;
    let successfulModel = '';

    if (geminiApiKey) {
      for (const model of modelCandidates) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.25,
                maxOutputTokens: 1200,
                responseMimeType: 'application/json',
                responseSchema: GEMINI_RESPONSE_SCHEMA,
              },
            }),
          });
          if (res.ok) {
            geminiRes = res;
            successfulModel = model;
            break;
          } else {
            console.warn(`Gemini model ${model} failed with status:`, res.status);
          }
        } catch (e) {
          console.warn(`Fetch to ${model} threw error:`, e);
        }
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      // Return warm human synthesis fallback
      const fallbackSummary = buildHumanFallback(question, entries, range, stats);
      return jsonResponse({
        type: 'fallback',
        summary: fallbackSummary,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map((e) => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'AI generation temporarily unavailable. Showing direct journal reflection.',
        isFallback: true,
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!rawText) {
      const fallbackSummary = buildHumanFallback(question, entries, range, stats);
      return jsonResponse({
        type: 'fallback',
        summary: fallbackSummary,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map((e) => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'Empty AI response. Showing direct journal reflection.',
        isFallback: true,
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return jsonResponse({
        type: 'ai-grounded',
        summary: rawText,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map((e) => ({ id: e.id, date: e.date, label: e.label })),
        limitations: '',
        isFallback: false,
      });
    }

    // Validate claims
    const validatedClaims: { text: string; evidenceIds: string[] }[] = [];
    if (Array.isArray(parsed.claims)) {
      for (const claim of parsed.claims) {
        if (claim.text && Array.isArray(claim.evidenceIds)) {
          const validIds = claim.evidenceIds.filter((id: string) => validEvidenceIds.has(id));
          if (validIds.length > 0) {
            validatedClaims.push({ text: claim.text, evidenceIds: validIds });
          }
        }
      }
    }

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      userId: user.id,
      topic: question.slice(0, 50),
      model: successfulModel,
      latencyMs: Date.now() - startTime,
      claimsTotal: parsed.claims?.length || 0,
      claimsValidated: validatedClaims.length,
    }));

    return jsonResponse({
      type: 'ai-grounded',
      summary: parsed.summary || rawText,
      dateRange: range,
      stats,
      claims: validatedClaims,
      evidenceMap: evidenceMap.map((e) => ({ id: e.id, date: e.date, label: e.label })),
      limitations: parsed.limitations || '',
      isFallback: false,
    });

  } catch (err: any) {
    console.error('Unhandled Edge Function error:', err?.message);
    return jsonResponse({ error: 'Internal Server Error' }, 500);
  }
});
