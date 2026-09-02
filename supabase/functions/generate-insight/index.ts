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

/* ── Rate limiter (30 queries per user per 24 hours) ─────────── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;

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

/* ── Check if query is completely unrelated to journaling/habits ─ */
function isOffTopicQuery(q: string): boolean {
  const lower = q.toLowerCase().trim();
  const codeMathKeywords = [
    'reverse a linkedlist', 'linkedlist in java', 'binary search', 'time complexity',
    'area of a circle', 'pythagorean theorem', 'formula for', 'write code in', 'how to code',
    'who is the president', 'capital of', 'solve x', 'derivative of', 'integral of',
  ];
  return codeMathKeywords.some((k) => lower.includes(k));
}

/* ── Filter Out Ghost / Unlogged Entries ──────────────────────── */
function hasMeaningfulData(e: any): boolean {
  if (e.daily_note?.trim()) return true;
  if (e.morning_mood || e.night_mood) return true;
  if (e.morning_brain_dump?.trim() || e.night_brain_dump?.trim()) return true;
  if (e.morning_why?.trim() || e.morning_inspire?.trim()) return true;
  if (e.night_win?.trim() || e.night_went_well?.trim() || e.night_improve?.trim() || e.night_intention?.trim()) return true;
  if (e.night_gratitude_1?.trim() || e.night_gratitude_2?.trim() || e.night_gratitude_3?.trim()) return true;
  if (Array.isArray(e.priorities) && e.priorities.some((p: any) => p && p.text?.trim())) return true;
  if (Array.isArray(e.action_steps) && e.action_steps.some((a: any) => a && a.text?.trim())) return true;
  if (Array.isArray(e.meals) && e.meals.some((m: any) => m && m.ate)) return true;
  if (Array.isArray(e.medications) && e.medications.some((m: any) => m && m.name?.trim())) return true;
  if (e.water_count && Number(e.water_count) > 0) return true;
  return false;
}

/* ── Format Journal Entries for AI Context ───────────────────── */
function formatJournalEntries(entries: any[]): string {
  const validEntries = entries.filter(hasMeaningfulData);
  return validEntries.map((e) => {
    const parts: string[] = [];
    parts.push(`=== DATE: ${e.entry_date} ===`);
    if (e.daily_note) parts.push(`Daily Note: "${e.daily_note}"`);
    
    // Morning
    if (e.morning_mood) parts.push(`Morning Mood: ${e.morning_mood} (Intensity: ${e.morning_mood_intensity || 'N/A'}/5)`);
    if (Array.isArray(e.morning_motivations) && e.morning_motivations.length) {
      parts.push(`Morning Motivations: ${e.morning_motivations.join(', ')}`);
    }
    if (e.morning_why) parts.push(`Morning Focus / Why: "${e.morning_why}"`);
    if (e.morning_brain_dump) parts.push(`Morning Brain Dump: "${e.morning_brain_dump}"`);
    if (e.morning_inspire) parts.push(`Morning Inspiration: "${e.morning_inspire}"`);
    if (Array.isArray(e.priorities) && e.priorities.length) {
      const pList = e.priorities.filter((p: any) => p && p.text?.trim()).map((p: any) => `"${p.text}" [${p.completed ? 'Completed' : 'Pending'}]`);
      if (pList.length) parts.push(`Priorities: ${pList.join('; ')}`);
    }
    if (Array.isArray(e.action_steps) && e.action_steps.length) {
      const aList = e.action_steps.filter((a: any) => a && a.text?.trim()).map((a: any) => `"${a.text}" [${a.completed ? 'Completed' : 'Pending'}]`);
      if (aList.length) parts.push(`Action Steps: ${aList.join('; ')}`);
    }

    // Day habits
    if (e.water_count != null && Number(e.water_count) > 0) {
      parts.push(`Water: ${e.water_count} glasses`);
    }
    if (Array.isArray(e.meals) && e.meals.some((m: any) => m && m.ate)) {
      const mList = e.meals
        .filter((m: any) => m && m.ate)
        .map((m: any) => `${m.meal_type}: Ate${m.time ? ` at ${m.time}` : ''}${m.notes ? ` (${m.notes})` : ''}`);
      if (mList.length) parts.push(`Logged Meals: ${mList.join('; ')}`);
    }
    if (Array.isArray(e.medications) && e.medications.length) {
      const medList = e.medications
        .filter((m: any) => m && m.name?.trim())
        .map((m: any) => `${m.name}${m.dose ? ` (${m.dose})` : ''}${m.time ? ` at ${m.time}` : ''} [${m.taken ? 'Taken' : 'Not taken'}]`);
      if (medList.length) parts.push(`Medications/Supplements: ${medList.join('; ')}`);
    }
    if (e.medication_notes) parts.push(`Medication Notes: "${e.medication_notes}"`);

    // Night reflection
    if (e.night_mood) parts.push(`Night Mood: ${e.night_mood} (Intensity: ${e.night_mood_intensity || 'N/A'}/5)`);
    const gratitudes = [e.night_gratitude_1, e.night_gratitude_2, e.night_gratitude_3].filter(Boolean);
    if (gratitudes.length) parts.push(`Gratitude: "${gratitudes.join('", "')}"`);
    if (e.night_win) parts.push(`Daily Win: "${e.night_win}"`);
    if (e.night_went_well) parts.push(`What Went Well: "${e.night_went_well}"`);
    if (e.night_improve) parts.push(`What to Improve: "${e.night_improve}"`);
    if (e.night_brain_dump) parts.push(`Night Brain Dump: "${e.night_brain_dump}"`);
    if (e.night_intention) parts.push(`Tomorrow's Intention: "${e.night_intention}"`);

    return parts.join('\n');
  }).join('\n\n');
}

/* ── Build System Prompt with User Personalisation ───────────── */
function buildSystemPrompt(persona: any, displayName?: string | null, userQuestion?: string): string {
  const isEnabled = persona?.personalisation_enabled !== false;
  
  // Format multi-select lists
  const rawLifeStages = Array.isArray(persona?.life_stages) && persona.life_stages.length
    ? persona.life_stages
    : (persona?.life_stage ? [persona.life_stage] : []);
  const lifeStages = isEnabled && rawLifeStages.length ? rawLifeStages.join(', ') : 'Not specified';

  const rawCareerFields = Array.isArray(persona?.career_fields) && persona.career_fields.length
    ? persona.career_fields
    : (persona?.career_field ? [persona.career_field] : []);
  const careerFields = isEnabled && rawCareerFields.length ? rawCareerFields.join(', ') : 'Not specified';

  const rawFocuses = Array.isArray(persona?.current_focuses) && persona.current_focuses.length
    ? persona.current_focuses
    : (persona?.current_focus ? [persona.current_focus] : []);
  const currentFocuses = isEnabled && rawFocuses.length ? rawFocuses.join(', ') : 'Not specified';

  const interests = isEnabled && Array.isArray(persona?.interests) && persona.interests.length ? persona.interests.join(', ') : 'technology, psychology, science';

  const rawStyles: string[] = Array.isArray(persona?.support_styles) && persona.support_styles.length
    ? persona.support_styles
    : (persona?.support_style ? [persona.support_style] : ['gentle']);
  const supportStyles = isEnabled && rawStyles.length ? rawStyles.join(', ') : 'gentle';

  const triviaEnabled = isEnabled ? persona?.trivia_enabled !== false : false;

  // Check whether explicit Action Steps should be generated:
  // ONLY if 'direct' is selected OR the user explicitly asked for actionable advice in their question
  const wantsActionSteps = rawStyles.includes('direct') ||
    Boolean(userQuestion && /(step|action|how to|what should i do|advice|fix|tips|plan|strategy|todo)/i.test(userQuestion));

  // High-contrast tone directives
  const toneDirectives: string[] = [];
  if (rawStyles.includes('direct')) {
    toneDirectives.push('• DIRECT & PRACTICAL: Keep it razor-sharp, punchy, and structured like an executive briefing. Zero fluff, high signal-to-noise ratio, crisp bottom-line insights.');
  }
  if (rawStyles.includes('playful')) {
    toneDirectives.push('• MEME-ISH & FUN: Be visibly witty, clever, and delightfully self-aware! Playfully poke fun at relatable human contradictions (e.g. declaring the whole day wasted at 4 PM then getting sudden motivation at 11 PM to fix your entire life; drinking 10 glasses of water after a month of photosynthesizing on zero; expecting a new desk chair to solve 10 hard interview questions; trying to conquer Accenture, Spring Boot, and DSA all before dinner). Talk like a brilliant, witty friend with great comedic timing. Avoid cringe internet buzzwords (no slang like "sigma/skibidi/cap"). Make it smart, witty, and genuinely laugh-out-loud relatable.');
  }
  if (rawStyles.includes('gentle')) {
    toneDirectives.push('• GENTLE & CALM: Offer deep, soothing validation, emotional warmth, and reassuring space. Ground the user peacefully without pressure or judgment.');
  }
  if (rawStyles.includes('cheerful')) {
    toneDirectives.push('• CHEERFUL & PLAYFUL: Celebrate wins enthusiastically with sunny optimism and bright energy.');
  }

  const toneBlock = toneDirectives.length ? toneDirectives.join('\n') : '• Balanced, compassionate, and attentive.';

  // Detect conversational intent
  const trimmedQ = (userQuestion || '').trim();
  const isCloserOrGratitude =
    /^(thanks?|thank\s*you|thx|ty|good\s*night|gn|bye|see\s*you|talk\s*later|got\s*it|makes\s*sense|okay\s*got\s*it|cool|appreciate\s*it|thank\s*you\s*so\s*much|thanks\s*a\s*lot|perfect\s*thanks)[!.\s]*$/i.test(trimmedQ);

  const isGreeting =
    /^(hi|hello|hey|heya|howdy|good\s*morning|good\s*afternoon|good\s*evening|what'?s\s*up|sup)[!.\s]*$/i.test(trimmedQ);

  let outputStructureInstructions = '';

  if (isCloserOrGratitude) {
    outputStructureInstructions = `CONVERSATIONAL CLOSER / GRATITUDE DETECTED:
The user is saying a closing remark or gratitude ("${trimmedQ}").
- Respond warmly, naturally, and concisely in 1-2 friendly sentences (e.g. "You're very welcome, ${displayName || 'friend'}! Rest well and take things one step at a time. I'm right here whenever you want to reflect again 🌸").
- DO NOT output any "### Patterns & Observations" or "### One Small Next Step" sections. Keep it natural, human, and brief.`;
  } else if (isGreeting) {
    outputStructureInstructions = `GREETING DETECTED:
The user is greeting you ("${trimmedQ}").
- Respond in 1-2 friendly, welcoming sentences asking how they are feeling or inviting them to share today's reflections or daily goals.
- DO NOT output "### Patterns & Observations" or "### One Small Next Step".`;
  } else {
    // Standard / Deep reflection mode
    outputStructureInstructions = `OUTPUT STRUCTURE:
- Direct, personalized opening addressing their exact question.
- ### Patterns & Observations
  (2-3 bite-sized bullet points with bold titles connecting their logged entries, habits, and mindset shifts)
${wantsActionSteps ? `- ### One Small Next Step
  (1 concrete, atomic action tailored to their focus: ${currentFocuses})` : `(NOTE: Do NOT include a "### One Small Next Step" section. Keep this reflection purely observational and validating without giving unsolicited action items.)`}
${triviaEnabled ? `- ### ✨ Tiny Spark
  (A fascinating 1-2 sentence sourced principle connected to: ${interests})
  [Source: Organization Name / Study]` : ''}`;
  }

  return `You are Mewwmory Companion, the warm, empathetic, and deeply observant private journaling companion inside Daylight Planner.
You are having an intimate conversation with ${displayName ? displayName : 'the author'} about their personal journal entries.

USER PROFILE CONTEXT:
- Current Path(s) / Stage(s): ${lifeStages}
- Field(s) / Area(s): ${careerFields}
- Primary Focus(es) Right Now: ${currentFocuses}
- Interests for Connections/Trivia: ${interests}
- Tone Preference(s): ${supportStyles}
- Trivia / Tiny Sparks Enabled: ${triviaEnabled ? 'YES' : 'NO'}

TONE & PERSONALITY DIRECTIVES (Apply strongly):
${toneBlock}

CORE PRINCIPLES:
1. Always answer the user's specific question directly in the very first sentence.
2. Ground all claims in their actual logged entries. Quote their exact words in quotes (e.g. "Stressful", "Accenture", "chair for back pain").
3. When they share vulnerability, frustration, or harsh self-talk (e.g. "I need to get my ass together"), validate their feelings without being preachy.
4. Adapt your metaphors to their field (${careerFields}) and focus (${currentFocuses}).
5. READABILITY: Keep paragraphs concise (1-2 sentences). Use clean bullet micro-cards with bold lead-in titles.

${outputStructureInstructions}

OFF-TOPIC GUARDRAIL:
- If asked a purely academic, coding, or generic trivia question completely unrelated to their journal (e.g. "how to reverse a linkedlist in java"):
  Gently clarify: "I'm your personal Daylight journaling companion, so I'm here to help you reflect on your journal entries, daily habits, and thoughts. Let's dive into your reflections or daily goals whenever you're ready! 🌸"`;
}

/* ── Main Handler ────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
    const { question, startDate, endDate, history = [] } = body;

    if (!question || typeof question !== 'string') {
      return jsonResponse({ error: 'question is required' }, 400);
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return jsonResponse({
        type: 'rate-limited',
        text: "You've reached your daily insight limit (30 messages per day). Your reflection companion will be ready for you again tomorrow! 🌸",
        dateRange: { start: startDate || '', end: endDate || '' },
      });
    }

    // Check if off-topic trivia/coding question
    if (isOffTopicQuery(question)) {
      return jsonResponse({
        type: 'off-topic',
        text: "I'm your personal Daylight journaling companion, so I'm here to help you explore your journal entries, daily habits, and reflections. Let's look into your thoughts, goals, or daily logs whenever you're ready! 🌸",
        dateRange: { start: startDate || '', end: endDate || '' },
      });
    }

    // Fetch user personalisation and settings in parallel
    const [personalisationRes, settingsRes] = await Promise.all([
      supabase.from('user_personalisation').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_settings').select('display_name').eq('user_id', user.id).maybeSingle(),
    ]);

    const persona = personalisationRes.data || {};
    const displayName = settingsRes.data?.display_name || null;

    // Query user's planner data
    let query = supabase
      .from('daily_entries')
      .select('*, priorities(*), action_steps(*), medications(*), meals(*), wind_down_items(*)')
      .eq('user_id', user.id);

    if (startDate && startDate !== 'all') {
      query = query.gte('entry_date', startDate);
    }
    if (endDate && endDate !== 'all') {
      query = query.lte('entry_date', endDate);
    }

    query = query.order('entry_date', { ascending: true });

    const { data: rawEntries, error: dbError } = await query;
    if (dbError) {
      console.error('Database fetch error:', dbError.message);
      return jsonResponse({ error: 'Failed to fetch planner entries' }, 500);
    }

    const entries = (rawEntries || []).filter(hasMeaningfulData);

    if (entries.length === 0) {
      const rangeLabel = startDate && endDate && startDate !== 'all'
        ? (startDate === endDate ? startDate : `${startDate} to ${endDate}`)
        : 'your journal';
      return jsonResponse({
        type: 'insufficient-data',
        text: `I couldn't find any planner entries for ${rangeLabel}. Once you log your morning intentions or night reflections, I'll be right here to reflect with you! 🌿`,
        dateRange: { start: startDate || '', end: endDate || '' },
      });
    }

    const formattedJournal = formatJournalEntries(entries);
    const dateRangeLabel = startDate && endDate && startDate !== 'all'
      ? `${startDate} to ${endDate}`
      : `All entries (${entries[0]?.entry_date} to ${entries[entries.length - 1]?.entry_date})`;

    const systemPrompt = buildSystemPrompt(persona, displayName, question);

    // Prepare multi-turn conversation contents for Gemini
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    // Prior chat turns
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-6)) {
        if (turn.role && turn.text) {
          contents.push({
            role: turn.role === 'user' ? 'user' : 'model',
            parts: [{ text: turn.text }],
          });
        }
      }
    }

    // Current turn with full context
    const currentPrompt = `[JOURNAL CONTEXT]
TIMEFRAME: ${dateRangeLabel} (${entries.length} logged entries)

JOURNAL ENTRIES:
${formattedJournal}

[USER QUESTION]
${question}`;

    contents.push({
      role: 'user',
      parts: [{ text: currentPrompt }],
    });

    const modelCandidates = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
    let aiAnswer = '';

    if (geminiApiKey) {
      for (const model of modelCandidates) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents,
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 2048,
              },
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              aiAnswer = text;
              break;
            }
          } else {
            console.warn(`Model ${model} returned status:`, res.status);
          }
        } catch (e) {
          console.warn(`Error calling ${model}:`, e);
        }
      }
    }

    if (!aiAnswer) {
      aiAnswer = `I looked closely through your journal entries for ${dateRangeLabel}. You've logged ${entries.length} check-ins with meaningful reflections on your habits and goals. Please feel free to ask a specific follow-up about your notes, mood, or daily progress! 🌸`;
    }

    return jsonResponse({
      type: 'success',
      text: aiAnswer,
      dateRange: {
        start: entries[0]?.entry_date || startDate || '',
        end: entries[entries.length - 1]?.entry_date || endDate || '',
      },
      entryCount: entries.length,
    });

  } catch (err: any) {
    console.error('Unhandled Edge Function error:', err?.message);
    return jsonResponse({ error: 'Internal Server Error' }, 500);
  }
});
