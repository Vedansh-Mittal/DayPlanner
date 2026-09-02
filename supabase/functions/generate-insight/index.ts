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

/* ── Rate limiter (simple in-memory, resets on cold start) ──── */
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
      if (snippet && snippet.trim()) {
        evidence.push({
          id: `EVD-${d}-${field}`,
          date: d,
          field,
          label,
          snippet: snippet.slice(0, 300),
        });
      }
    };

    if (e.morning_mood) add('MOOD-MORN', 'Morning Mood', `${e.morning_mood} (intensity: ${e.morning_mood_intensity ?? 'N/A'})`);
    if (e.night_mood) add('MOOD-NIGHT', 'Night Mood', `${e.night_mood} (intensity: ${e.night_mood_intensity ?? 'N/A'})`);
    if (e.daily_note) add('NOTE', 'Daily Note', e.daily_note);
    if (e.morning_why) add('WHY', 'Morning Why', e.morning_why);
    if (e.morning_brain_dump) add('BRAIN-MORN', 'Morning Brain Dump', e.morning_brain_dump);
    if (e.morning_inspire) add('INSPIRE', 'Inspiration', e.morning_inspire);
    if (e.night_brain_dump) add('BRAIN-NIGHT', 'Night Brain Dump', e.night_brain_dump);
    if (e.night_win) add('WIN', 'Win of the Day', e.night_win);
    if (e.night_went_well) add('WELL', 'What Went Well', e.night_went_well);
    if (e.night_improve) add('IMPROVE', 'What to Improve', e.night_improve);
    if (e.night_intention) add('INTENTION', 'Tomorrow Intention', e.night_intention);
    const gratitudes = [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3].filter(Boolean);
    if (gratitudes.length) add('GRATITUDE', 'Gratitude', gratitudes.join('; '));
    if (e.water_count != null) add('WATER', 'Water', `${e.water_count} glasses`);

    if (Array.isArray(e.priorities)) {
      const pTexts = e.priorities.filter((p: any) => p.text?.trim()).map((p: any) => `${p.text} [${p.completed ? 'Done' : 'Not done'}]`);
      if (pTexts.length) add('PRIORITIES', 'Priorities', pTexts.join('; '));
    }
    if (Array.isArray(e.action_steps)) {
      const aTexts = e.action_steps.filter((a: any) => a.text?.trim()).map((a: any) => `${a.text} [${a.completed ? 'Done' : 'Not done'}]`);
      if (aTexts.length) add('ACTIONS', 'Action Steps', aTexts.join('; '));
    }
    if (Array.isArray(e.medications)) {
      const medTexts = e.medications
        .filter((m: any) => m.name?.trim())
        .map((m: any) => `${m.name}${m.dose ? ` (${m.dose})` : ''}${m.time ? ` at ${m.time}` : ''} [${m.taken ? 'Taken' : 'Not taken'}]`);
      if (medTexts.length) add('MEDS', 'Medications', medTexts.join('; '));
    }
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

/* ── Deterministic fallback summary ──────────────────────────── */
function buildFallbackSummary(stats: ReturnType<typeof calculateStats>, range: { start: string; end: string }): string {
  const parts: string[] = [];
  parts.push(`Here's what your data shows for ${range.start} to ${range.end}:`);
  parts.push(`• ${stats.entryCount} journal entries found`);
  parts.push(`• ${stats.morningCheckins} morning check-ins, ${stats.nightCheckins} night check-ins`);
  if (stats.avgWaterGlasses != null) parts.push(`• Average water intake: ${stats.avgWaterGlasses} glasses/day (${stats.waterLoggedDays} days logged)`);
  if (stats.avgMorningMoodScore != null) parts.push(`• Average morning mood: ${stats.avgMorningMoodScore}/5`);
  if (stats.avgNightMoodScore != null) parts.push(`• Average night mood: ${stats.avgNightMoodScore}/5`);
  if (stats.prioritiesCompletionRate != null) parts.push(`• Priorities completed: ${stats.prioritiesCompleted}/${stats.prioritiesTotal} (${stats.prioritiesCompletionRate}%)`);
  if (stats.actionStepsCompletionRate != null) parts.push(`• Action steps completed: ${stats.actionStepsCompleted}/${stats.actionStepsTotal} (${stats.actionStepsCompletionRate}%)`);
  return parts.join('\n');
}

/* ── Gemini structured response schema ───────────────────────── */
const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'A warm, concise overview answering the user question (100-200 words)' },
    dateRange: { type: 'STRING', description: 'The date range analyzed, e.g. "2026-08-01 to 2026-08-31"' },
    claims: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'A single factual observation grounded in the evidence' },
          evidenceIds: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'One or more evidence IDs from the provided evidence list that support this claim',
          },
        },
        required: ['text', 'evidenceIds'],
      },
      description: 'List of evidence-grounded claims',
    },
    limitations: { type: 'STRING', description: 'Any caveats about data gaps, short range, or fields not logged' },
  },
  required: ['summary', 'dateRange', 'claims', 'limitations'],
};

const SYSTEM_PROMPT = `You are a private, compassionate journaling companion inside Daylight Planner. You answer ONE question from the person who wrote the entries below.

STRICT RULES — violating any of these invalidates the response:

1. USE ONLY THE PROVIDED EVIDENCE. Every claim you make MUST reference one or more evidence IDs from the EVIDENCE list. Never cite an evidence ID that wasn't given to you.
2. NEVER invent dates, quotes, numbers, patterns, activities, emotions, or quantities not explicitly present in the evidence.
3. NEVER infer a medical diagnosis, treatment recommendation, or causal relationship. Describe patterns as observations, not proof of causation.
4. If evidence is insufficient to answer the question, set the summary to explain what's missing and return an empty claims array.
5. Use gentle, non-judgmental, warm language. Talk like a caring friend who has read their journal.
6. Keep the summary between 100-200 words. Be concise and specific.
7. Every claim's evidenceIds array must contain ONLY IDs from the EVIDENCE section below. Do not fabricate IDs.

You MUST respond in the exact JSON schema provided. Do not add any text outside the JSON object.`;

/* ── Main handler ────────────────────────────────────────────── */
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { question, startDate, endDate } = body;

    if (!question || typeof question !== 'string' || !startDate || !endDate) {
      return jsonResponse({ error: 'question, startDate, and endDate are required' }, 400);
    }

    const range = { start: startDate, end: endDate };

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

    if (entries.length === 0) {
      return jsonResponse({
        type: 'insufficient-data',
        summary: `I couldn't find any planner entries from ${range.start} to ${range.end}. Try logging a day or selecting another date range!`,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: [],
        limitations: 'No entries found in the requested date range.',
        isFallback: true,
      });
    }

    const qLower = question.toLowerCase();
    const isTrendQuestion = /trend|pattern|progress|overall|summary|general|month|week|habit|consistenc/i.test(qLower);
    if (isTrendQuestion && entries.length < 3) {
      return jsonResponse({
        type: 'insufficient-data',
        summary: `I found only ${entries.length} entry${entries.length === 1 ? '' : 'ies'} from ${range.start} to ${range.end}. I need at least 3 completed entries to analyze trends and patterns meaningfully. Keep journaling — your insights will get richer!`,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: [],
        limitations: `Only ${entries.length} entries available; 3+ needed for trend analysis.`,
        isFallback: true,
      });
    }

    const evidenceMap = buildEvidenceMap(entries);
    const validEvidenceIds = new Set(evidenceMap.map(e => e.id));

    if (!geminiApiKey) {
      const fallbackSummary = buildFallbackSummary(stats, range);
      console.log(JSON.stringify({
        ts: new Date().toISOString(), userId: user.id, topic: question.slice(0, 50),
        range, success: true, fallback: true, latencyMs: Date.now() - startTime,
      }));
      return jsonResponse({
        type: 'fallback',
        summary: fallbackSummary,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map(e => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'AI insights are temporarily unavailable. Showing verified statistics instead.',
        isFallback: true,
      });
    }

    const evidenceText = evidenceMap.map(e => `[${e.id}] ${e.label} on ${e.date}: ${e.snippet}`).join('\n');

    const userPrompt = `DATE RANGE: ${range.start} to ${range.end} (${entries.length} entries)

PRE-CALCULATED STATISTICS (verified, use as-is):
${JSON.stringify(stats, null, 2)}

EVIDENCE (cite these IDs in your claims):
${evidenceText}

USER QUESTION: ${question}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    const geminiPayload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    };

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });
    } catch (fetchErr) {
      console.error('Gemini fetch error:', fetchErr);
      const fallbackSummary = buildFallbackSummary(stats, range);
      return jsonResponse({
        type: 'fallback',
        summary: fallbackSummary,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map(e => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'AI service is temporarily unavailable. Showing verified statistics.',
        isFallback: true,
      });
    }

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiRes.status, geminiRes.statusText);
      const fallbackSummary = buildFallbackSummary(stats, range);
      return jsonResponse({
        type: 'fallback',
        summary: fallbackSummary,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map(e => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'AI service returned an error. Showing verified statistics instead.',
        isFallback: true,
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!rawText) {
      const fallbackSummary = buildFallbackSummary(stats, range);
      return jsonResponse({
        type: 'fallback',
        summary: fallbackSummary,
        dateRange: range,
        stats,
        claims: [],
        evidenceMap: evidenceMap.map(e => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'AI returned an empty response. Showing verified statistics.',
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
        evidenceMap: evidenceMap.map(e => ({ id: e.id, date: e.date, label: e.label })),
        limitations: 'AI response could not be structured. Claims are not individually verified.',
        isFallback: false,
      });
    }

    // Validate claims — strip any claim with unknown evidence IDs
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

    // Log operational metadata (no raw journal text)
    const tokenEstimate = geminiData.usageMetadata?.totalTokenCount || null;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      userId: user.id,
      topic: question.slice(0, 50),
      range,
      success: true,
      fallback: false,
      claimsTotal: parsed.claims?.length || 0,
      claimsValidated: validatedClaims.length,
      latencyMs: Date.now() - startTime,
      tokenEstimate,
    }));

    return jsonResponse({
      type: 'ai-grounded',
      summary: parsed.summary || rawText,
      dateRange: range,
      stats,
      claims: validatedClaims,
      evidenceMap: evidenceMap.map(e => ({ id: e.id, date: e.date, label: e.label })),
      limitations: parsed.limitations || '',
      isFallback: false,
    });

  } catch (err: any) {
    console.error('Unhandled error:', err?.message);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
