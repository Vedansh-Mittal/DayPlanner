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

/* [TAG: DETERMINISTIC_CONTEXT_SCOPING_V1] */
function detectTargetField(question: string, history: any[] = []): 'priorities' | 'all' {
  const q = question.toLowerCase();
  if (q.includes('priorit') || q.includes('to-do') || q.includes('todo')) {
    return 'priorities';
  }
  // Follow-up queries without an explicit field (e.g. "explain me in more detail", "give steps")
  if (q.includes('detail') || q.includes('elaborate') || q.includes('more') || q.includes('explain') || q.includes('why') || q.includes('steps') || q.includes('help')) {
    if (Array.isArray(history) && history.length > 0) {
      const userTurns = history.filter((t: any) => t.role === 'user');
      const lastUserQ = userTurns[userTurns.length - 1]?.text?.toLowerCase() || '';
      if (lastUserQ.includes('priorit') || lastUserQ.includes('to-do') || lastUserQ.includes('todo')) {
        return 'priorities';
      }
    }
  }
  return 'all';
}

/* [TAG: TEMPORAL_DATE_LOCK_V1] */
function detectSingleDayLock(question: string, history: any[] = [], startDate?: string, endDate?: string): boolean {
  const q = question.toLowerCase();
  if (q.includes('today') || (startDate && endDate && startDate === endDate && startDate !== 'all')) {
    return true;
  }
  if (q.includes('priorit') && !q.includes('past') && !q.includes('all') && !q.includes('week') && !q.includes('month') && !q.includes('trend')) {
    return true;
  }
  // Follow-up queries
  if (q.includes('detail') || q.includes('elaborate') || q.includes('more') || q.includes('explain') || q.includes('why') || q.includes('steps')) {
    if (Array.isArray(history) && history.length > 0) {
      const userTurns = history.filter((t: any) => t.role === 'user');
      const lastUserQ = userTurns[userTurns.length - 1]?.text?.toLowerCase() || '';
      if (lastUserQ.includes('today') || (lastUserQ.includes('priorit') && !lastUserQ.includes('all') && !lastUserQ.includes('trend'))) {
        return true;
      }
    }
  }
  return false;
}

/* ── Format Journal Entries for AI Context ───────────────────── */
function formatJournalEntries(entries: any[], targetField: 'priorities' | 'all' = 'all'): string {
  const validEntries = entries.filter(hasMeaningfulData);
  return validEntries.map((e) => {
    const parts: string[] = [];
    parts.push(`=== DATE: ${e.entry_date} ===`);

    /* [TAG: DETERMINISTIC_CONTEXT_SCOPING_V1] */
    if (targetField === 'priorities') {
      // Deterministically ONLY include priorities and action steps.
      // Brain dumps, notes, mood, and meals are physically excluded from the payload!
      if (Array.isArray(e.priorities) && e.priorities.length) {
        const pList = e.priorities.filter((p: any) => p && p.text?.trim()).map((p: any) => `"${p.text}" [${p.completed ? 'Completed' : 'Pending'}]`);
        if (pList.length) parts.push(`Priorities: ${pList.join('; ')}`);
      } else {
        parts.push(`Priorities: None logged.`);
      }
      if (Array.isArray(e.action_steps) && e.action_steps.length) {
        const aList = e.action_steps.filter((a: any) => a && a.text?.trim()).map((a: any) => `"${a.text}" [${a.completed ? 'Completed' : 'Pending'}]`);
        if (aList.length) parts.push(`Action Steps: ${aList.join('; ')}`);
      }
      return parts.join('\n');
    }

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

/* [AI-ENHANCEMENT: HABIT-BASELINE-PRECOMPUTE] */
// Computes longitudinal statistics across all loaded entries to distinguish established routines from one-off anomalies.
function computeLongitudinalHabitBaseline(entries: any[]): string {
  if (!entries || entries.length === 0) return 'No entries recorded yet.';
  const total = entries.length;
  let breakfastCount = 0;
  let lunchCount = 0;
  let dinnerCount = 0;
  let totalWater = 0;
  let waterDays = 0;
  const focusWords = new Map<string, number>();

  for (const e of entries) {
    if (Array.isArray(e.meals)) {
      for (const m of e.meals) {
        if (!m || !m.ate) continue;
        const type = (m.meal_type || '').toLowerCase();
        if (type.includes('breakfast')) breakfastCount++;
        if (type.includes('lunch')) lunchCount++;
        if (type.includes('dinner')) dinnerCount++;
      }
    }
    if (e.water_count != null && Number(e.water_count) > 0) {
      totalWater += Number(e.water_count);
      waterDays++;
    }
    if (Array.isArray(e.priorities)) {
      for (const p of e.priorities) {
        if (p?.text?.trim()) {
          const clean = p.text.trim();
          focusWords.set(clean, (focusWords.get(clean) || 0) + 1);
        }
      }
    }
  }

  const lines: string[] = [];
  lines.push(`• Total Logged Check-ins: ${total} days`);

  // Breakfast routine detection
  if (total >= 2) {
    const bfRatio = breakfastCount / total;
    if (bfRatio <= 0.35) {
      lines.push(`• Breakfast Pattern: Skipped on ${total - breakfastCount} of ${total} logged days (Established routine: Intermittent fasting / developer morning focus flow. Treat skipping breakfast as their NORMAL baseline, NOT as an alarming emergency).`);
    } else if (bfRatio >= 0.7) {
      lines.push(`• Breakfast Pattern: Consistently eaten (${breakfastCount} of ${total} logged days).`);
    } else {
      lines.push(`• Breakfast Pattern: Varies (${breakfastCount} days eaten out of ${total}).`);
    }
  }

  if (waterDays > 0) {
    const avgWater = (totalWater / waterDays).toFixed(1);
    lines.push(`• Hydration Baseline: Average ${avgWater} glasses/day across logged days.`);
  }

  // Top recurring focus items
  const sortedFocus = Array.from(focusWords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w, c]) => `"${w}" (${c}x)`);
  if (sortedFocus.length > 0) {
    lines.push(`• Recurring Priority Themes: ${sortedFocus.join(', ')}`);
  }

  return lines.join('\n');
}

/* [AI-ENHANCEMENT: HIERARCHICAL-WINDOW-SCALING] */
// For long-term journals (>14 days), preserves full granular logs for the recent 14 days
// while compressing older history into an aggregated baseline so prompts remain under ~2,500 tokens forever.
function prepareHierarchicalJournalContext(entries: any[], targetField: 'priorities' | 'all' = 'all'): { contextText: string; isScaled: boolean } {
  const validEntries = entries.filter(hasMeaningfulData);
  if (targetField === 'priorities' || validEntries.length <= 14) {
    return {
      contextText: formatJournalEntries(validEntries, targetField),
      isScaled: false,
    };
  }

  // Split: Older entries vs. Recent 14 entries
  const recentEntries = validEntries.slice(-14);
  const olderEntries = validEntries.slice(0, -14);

  const olderSummary = `=== HISTORICAL BASELINE SUMMARY (${olderEntries[0]?.entry_date} to ${olderEntries[olderEntries.length - 1]?.entry_date}, ${olderEntries.length} entries) ===
${computeLongitudinalHabitBaseline(olderEntries)}
• Sample Historical Wins: ${olderEntries.filter((e: any) => e.night_win).map((e: any) => `"${e.night_win}"`).slice(-3).join('; ') || 'None recorded'}`;

  const recentDetail = formatJournalEntries(recentEntries, targetField);

  return {
    contextText: `${olderSummary}\n\n=== RECENT GRANULAR LOGS (Last 14 days) ===\n${recentDetail}`,
    isScaled: true,
  };
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
    toneDirectives.push('• MEME-ISH & FUN: Be visibly witty, clever, and pleasantly self-aware. Use lighthearted humor and great comedic timing when reflecting, like a smart, funny friend who keeps it real without cringe slang.');
  }
  if (rawStyles.includes('gentle')) {
    toneDirectives.push('• GENTLE & CALM: Offer deep, soothing validation, emotional warmth, and reassuring space. Ground the user peacefully without pressure or judgment.');
  }
  if (rawStyles.includes('cheerful')) {
    toneDirectives.push('• CHEERFUL & PLAYFUL: Celebrate wins enthusiastically with sunny optimism and bright energy.');
  }

  const toneBlock = toneDirectives.length ? toneDirectives.join('\n') : '• Balanced, compassionate, and attentive.';

  return `You are Mewwmory Companion, a thoughtful, discreet, and observant private journaling assistant inside Daylight Planner.
You are assisting ${displayName ? displayName : 'the author'}.

USER PROFILE CONTEXT:
- Current Path(s) / Stage(s): ${lifeStages}
- Field(s) / Area(s): ${careerFields}
- Primary Focus(es) Right Now: ${currentFocuses}
- Interests for Connections/Trivia: ${interests}
- Tone Preference(s): ${supportStyles}
- Trivia / Tiny Sparks Enabled: ${triviaEnabled ? 'YES' : 'NO'}

TONE & PERSONALITY DIRECTIVES:
${toneBlock}

CORE ASSISTANT PRINCIPLES:
1. You are an assistant for their self-reflection, NOT a nagging manager or pushy coach. NEVER volunteer the user's specific priorities, study tasks, or to-dos unprompted. Let the user lead the conversation.
2. Ground all analytical claims strictly in their actual logged entries. Quote their exact words in quotes (e.g. "Stressful", "chair for back pain").
3. READABILITY: Keep paragraphs concise (1-2 sentences).
/* [AI-ENHANCEMENT: HABIT-BASELINE-PRECOMPUTE] */
4. HABIT BASELINE & ROUTINE RECOGNITION:
   Review the provided Habit Baseline. If a user consistently demonstrates a recurring habit (such as skipping breakfast or low daytime water), acknowledge it as their established routine (e.g. intermittent fasting or deep developer focus), NOT as an alarming emergency or surprise. Only comment on habits if they genuinely deviate from their established baseline.

/* [AI-ENHANCEMENT: TEMPORAL-COMPLETENESS-METRIC] */
5. TEMPORAL AWARENESS & NATURAL CONVERSATION:
   Be aware of which days were recorded vs unrecorded. Never assume skipped logs mean zero food, starvation, or inactivity. Speak naturally like a thoughtful human companion—do NOT recite or repeat robotic disclaimers (e.g. "Reflecting across your X logged days...") at the start of your answers. Let the conversation flow naturally.

/* [AI-ENHANCEMENT: ADAPTIVE-DEPTH-AND-STRUCTURE] */
6. ADAPTIVE DEPTH & CONVERSATIONAL FLUIDITY:
   - When the user asks a standard reflection: Provide a warm, personalized opening, followed by structured bullet cards (### Patterns & Observations, ### One Small Next Step, and ### ✨ Tiny Spark).
   - When the user asks for DEPTH, EXAMPLES, COMPREHENSIVE EXPLANATIONS, OR LONGER ESSAYS: Fully honor their request! Write deep, thoughtful, multi-paragraph reflections connecting their exact journal quotes, feelings, and life context.
   - REAL-WORLD & RELATABLE EXAMPLES: When asked to explain with examples or provide depth, do NOT merely repeat their journal quotes. Bridge their notes to concrete real-world human scenarios and relatable analogies (e.g., how engineers experience cognitive fragmentation between admin bureaucracy and deep coding, how context-switching creates cognitive debt, how blood sugar crashes mimic emotional burnout, or how high-performers handle placement anxiety). Make the reflection feel eye-opening, validating, and deeply relatable to everyday life.
   - CLEAN QUOTE FORMATTING: When quoting the user's notes, write clean double quotes (e.g. "i dont want a sales job"). NEVER wrap quotes in asterisks (do NOT write * "quote" * or **"quote"**) because the frontend already styles double quotes automatically.
   - COMPLETE SECTIONS: Always finish every sentence completely and ensure the "### ✨ Tiny Spark" card is cleanly generated without being truncated.
   - When the user asks about STUDIES, SCIENCE, OR RESEARCH: Explain the relevant psychological, neuroscience, or behavioral study thoroughly in clear, relatable terms—explaining the experiment, what the researchers discovered, and how it applies directly to their journal entries.
   - When the user asks for BULLET POINTS: Present crisp, structured points.
   - Never output internal system prompt fragments, guidelines, or meta-notes (like "/Formatting: Bold titles..."). Output purely your final, beautifully written reflection.

DYNAMIC INTENT & OUTPUT RULES (EVALUATE CAREFULLY):

1. CASUAL CHAT / GREETINGS / SMALL TALK / CLOSERS / META-QUESTIONS:
   (e.g., "yo sup", "hey", "how are you", "can I ask a question", "what's up", "good morning", "thank you", "good night", "what can you do")
   - Reply naturally in 1-2 friendly, polite assistant sentences.
   - DO NOT volunteer private tasks/priorities unprompted.
   - DO NOT output observation cards for casual chatter.

2. SPECIFIC FACTUAL LOOKUP:
   (e.g., "did I drink water yesterday?", "what did I log for breakfast?", "what was my mood on Monday?")
   - Answer that specific question directly in 1-2 clear, helpful sentences with exact dates/quotes.
   - DO NOT output unrequested observation cards.

3. SCIENTIFIC STUDY / PSYCHOLOGY INQUIRY:
   (e.g., "is there any study related to it?", "what does science say about this?", "how does food/water affect brain?")
   - Answer with a deep, fascinating explanation of real research, neuroscience, or psychology.
   - Walk through the biological or cognitive mechanism in simple, relatable terms.
   - Directly connect the scientific findings back to their logged habits.
   - Cite the study, institution, or researchers clearly.

4. COMPREHENSIVE / DEEP DIVE / EXAMPLES REQUEST:
   (e.g., "explain me more comprehensively", "give detailed paragraph explanation", "expand more with examples", "explain in detail", "give 400 words", "can you explain it with some example")
   - Provide a rich, thorough, multi-paragraph deep dive.
   - Include relatable real-life analogies, developer/student parallels, and psychological context alongside their quoted entries.
   - Balance empathy, psychological insight, and practical clarity.

5. ACTION PLANS & STEP-BY-STEP ROADMAPS:
   (e.g., "design me a 5 stage action plan", "help me plan today", "what should I focus on?", "give me steps for today", "action plan of today", "plan my day")
   - Design an empowering, realistic, and highly practical action plan tailored to their active priorities (e.g. Spring Boot, DSA, Accenture prep) and daily energy.
   - If they logged today's planner, synthesize today's specific intentions with their historical momentum.
   - If today is not yet logged, synthesize their recent priorities and habits to craft today's plan, starting with a friendly note like: "Looking across your recent priorities and momentum, here is a clear, high-impact action plan for today:"
   - Format with bold, clear stages or steps (e.g. **Stage 1: ...**, **Stage 2: ...** or **Step 1: ...**).
   - Keep each step atomic, achievable, and anchored in deep focus sprints (e.g. 30–45 mins).

6. STANDARD REFLECTION REQUEST:
   (e.g., "what do you make of my brain dumps?", "analyze my week", "how have I been doing?", "what patterns do you see?")
   - Warm, personalized opening addressing their question.
   - ### Patterns & Observations
     (2-3 rich, insightful bullet cards connecting their logged entries and mindset)
${wantsActionSteps ? `   - ### One Small Next Step
     (1 concrete, atomic action tailored to their focus: ${currentFocuses})` : ''}
${triviaEnabled ? `   - ### ✨ Tiny Spark
     (Write 1-2 fascinating sentences explaining a real scientific principle, psychological concept, or engineering trivia directly related to: ${interests})
     Source: Organization / Publication Name (strictly on this separate line below the spark text)` : ''}

3.5. TARGETED SINGLE-FIELD / PRIORITIES QUERY [TAG: SCOPED_QUERY_FILTER_V1]:
   (e.g., "what do you make out of my today's priorities", "focus on priorities", "what are my priorities for today", "analyze my priorities", "priorities of the day")
   - STRICT FIELD ISOLATION: When the user asks specifically about their PRIORITIES (or any single field like mood or meals), focus strictly and exclusively on the priorities items!
   - DO NOT pull in unrelated brain dumps, personal family/wedding thoughts, night notes, or unasked background life context unless specifically requested by the user.
   - SINGLE-DAY BOUNDARY: If the user asked about "today's priorities" or a single date, do NOT list historical priorities from previous days (e.g. Sept 1–3). Restrict your entire answer to the priorities of that specific day!

OFF-TOPIC GUARDRAIL:
- If asked a purely academic, coding, or generic trivia question completely unrelated to their journal (e.g. "how to reverse a linkedlist in java"):
  Gently clarify: "I'm your personal Daylight journaling assistant, so I'm here to help you reflect on your journal entries, daily habits, and thoughts whenever you're ready! 🌸"`;
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
    const { question, startDate, endDate, history = [], entries: clientEntries } = body;

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

    let entries: any[] = [];

    // If client provided pre-decrypted entries (Zero-Knowledge E2EE mode), use them directly!
    if (Array.isArray(clientEntries) && clientEntries.length > 0) {
      entries = clientEntries.filter(hasMeaningfulData);
    } else {
      // Fallback: Query database directly
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

      entries = (rawEntries || []).filter(hasMeaningfulData);
    }

    // Graceful Fallback: If a specific date (e.g. today) yielded 0 entries, fetch recent entries so planning/advice succeeds
    if (entries.length === 0 && startDate && startDate !== 'all') {
      const { data: fallbackEntries } = await supabase
        .from('daily_entries')
        .select('*, priorities(*), action_steps(*), medications(*), meals(*), wind_down_items(*)')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
        .limit(14);

      const validFallback = (fallbackEntries || []).filter(hasMeaningfulData).reverse();
      if (validFallback.length > 0) {
        entries = validFallback;
      }
    }

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

    /* [TAG: TEMPORAL_DATE_LOCK_V1] */
    // If user asked about today, or a specific day's priorities, or follows up on today:
    // lock entries strictly to the single active day to eliminate historical drift!
    const shouldLockSingleDay = detectSingleDayLock(question, history, startDate, endDate);
    if (shouldLockSingleDay && entries.length > 1) {
      entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      const todayStr = new Date().toISOString().split('T')[0];
      const todayEntry = entries.find(e => e.entry_date === todayStr);
      entries = todayEntry ? [todayEntry] : [entries[entries.length - 1]];
    }

    /* [TAG: DETERMINISTIC_CONTEXT_SCOPING_V1] */
    // Detect if the query or its active follow-up targets a specific field (e.g. priorities)
    const targetField = detectTargetField(question, history);

    /* [AI-ENHANCEMENT: HABIT-BASELINE-PRECOMPUTE] */
    const habitBaseline = targetField === 'priorities'
      ? 'Focus strictly on the provided priorities for this day.'
      : computeLongitudinalHabitBaseline(entries);

    /* [AI-ENHANCEMENT: HIERARCHICAL-WINDOW-SCALING] */
    const { contextText: formattedJournal, isScaled } = prepareHierarchicalJournalContext(entries, targetField);

    /* [AI-ENHANCEMENT: TEMPORAL-COMPLETENESS-METRIC] */
    let completenessNotice = '';
    if (targetField !== 'priorities' && startDate && endDate && startDate !== 'all' && endDate !== 'all') {
      try {
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
        const totalDaysInWindow = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const loggedCount = entries.length;
        const missingDaysCount = Math.max(0, totalDaysInWindow - loggedCount);

        if (totalDaysInWindow > 1) {
          completenessNotice = `[DATASET COMPLETENESS & COVERAGE]
• Requested Calendar Window: ${startDate} to ${endDate} (${totalDaysInWindow} calendar days)
• Recorded Check-in Entries: ${loggedCount} days
• Unrecorded / Skipped Days: ${missingDaysCount} days (${Math.round((loggedCount / totalDaysInWindow) * 100)}% coverage)

CRITICAL INSTRUCTION FOR MISSING DAYS:
${missingDaysCount > 0
  ? `- The user recorded logs for ${loggedCount} out of ${totalDaysInWindow} days. Be aware that missing dates were simply unrecorded check-ins (never assume unrecorded days were inactive, zero-calorie, or fasts).
- Speak naturally like a thoughtful human companion. Do NOT recite or repeat robotic disclaimers like "Reflecting across your X logged days..." in your answers unless the user specifically asks about their logged coverage.`
  : '- All calendar days in this window have recorded check-ins.'
}
`;
        }
      } catch (e) {
        console.warn('Date calculation error:', e);
      }
    }

    const dateRangeLabel = entries.length === 1
      ? entries[0]?.entry_date
      : (startDate && endDate && startDate !== 'all'
          ? `${startDate} to ${endDate}`
          : `All entries (${entries[0]?.entry_date} to ${entries[entries.length - 1]?.entry_date})`);

    const systemPrompt = buildSystemPrompt(persona, displayName, question);

    /* [TAG: CLEAN_HISTORY_TOKEN_OPTIMIZATION_V1] */
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
TIMEFRAME: ${dateRangeLabel} (${entries.length} logged entries${isScaled ? ' - Scaled with Hierarchical Summary' : ''})

${completenessNotice ? `${completenessNotice}\n` : ''}[ESTABLISHED HABIT BASELINE]
${habitBaseline}

JOURNAL ENTRIES:
${formattedJournal}

[USER QUESTION]
${question}`;

    contents.push({
      role: 'user',
      parts: [{ text: currentPrompt }],
    });

    /* [TAG: DIRECT_GEMINI_15_FLASH_ROUTE_V1] */
    // Point directly to verified gemini-1.5-flash to eliminate the 2.2s 404 delay
    const modelCandidates = ['gemini-1.5-flash'];
    let aiAnswer = '';

    if (geminiApiKey) {
      for (const model of modelCandidates) {
        for (let attempt = 0; attempt < 2; attempt++) {
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
                  maxOutputTokens: 3000,
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
              console.warn(`Model ${model} attempt ${attempt + 1} returned status:`, res.status);
              if (res.status === 429) {
                return jsonResponse({
                  type: 'rate-limited',
                  text: "Google AI rate limit reached (too many rapid requests). Please pause for 15-20 seconds before asking your next follow-up! 🌸",
                  dateRange: { start: entries[0]?.entry_date || startDate || '', end: entries[entries.length - 1]?.entry_date || endDate || '' },
                  entryCount: entries.length,
                });
              }
              if (res.status === 503 && attempt === 0) {
                await new Promise((resolve) => setTimeout(resolve, 800));
                continue;
              }
            }
          } catch (e) {
            console.warn(`Error calling ${model} attempt ${attempt + 1}:`, e);
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }
          }
        }
        if (aiAnswer) break;
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
