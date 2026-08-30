import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_APP_ID = '425d855f-6ca6-4145-989f-800043b9635c';

const MORNING_MESSAGES = [
  "Good morning ☀️ I hope you have wonderful day, showing up is the biggest achievement, {name}!",
  "Rise and shine, {name}! 🌅 Today is a brand new page. Let's make it a calm and beautiful one.",
  "Morning! ☀️ A friendly reminder to take a deep breath and start your day with intention, {name}.",
  "Good morning, {name}! 🌸 Small steps lead to big places. Let's set your priorities for today!"
];

const LUNCH_MESSAGES = [
  "Lunch check! Have you fed the human running that brilliant brain, {name}? 🍲. Also, it's time to write down your morning thoughts.",
  "Hey {name}! Halfway through the day. 🥪 Let's take a quick pause and write down your morning thoughts.",
  "Mid-day check-in! 🥗 Give your mind a 2-minute break and fill in those morning thoughts, {name}."
];

const NIGHT_MESSAGES = [
  "The day is winding down 🌙 Take two quiet minutes to reflect, then let the rest wait until tomorrow, {name}.",
  "Time to unwind, {name}. 🌌 Celebrate your wins today, write them down, and let go of the rest.",
  "Reflection time 🌙 You did your best today, {name}. Let's write down your evening thoughts.",
  "Evening, {name}! ✨ Reflect on what went well and prepare your mind for peaceful rest."
];

Deno.serve(async (req) => {
  // 1. Verify custom Cron Secret for security
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret || requestSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized access" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Initialize Supabase Client using Service Role Key to bypass RLS for rpc functions
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY") || "";

  if (!supabaseUrl || !supabaseServiceKey || !onesignalApiKey) {
    return new Response(
      JSON.stringify({ error: "Missing backend configuration environment secrets" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 3. Fetch active pending users with calculated local timezone relative dates and times
    const { data: users, error: fetchErr } = await supabase.rpc('get_pending_reminders');

    if (fetchErr) {
      console.error('Error calling get_pending_reminders:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    console.log(`Processing reminders for ${users?.length || 0} active users...`);
    const results = [];

    for (const user of users || []) {
      const {
        user_id: userId,
        display_name: displayName,
        local_date: localDate,
        local_time: localTime,
        morning_reminder: morningTime,
        night_reminder: nightTime,
        morning_completed: morningDone,
        night_completed: nightDone,
      } = user;

      const userName = displayName || "there";
      let reminderType = "";
      let messageTemplate = "";

      // Evaluate match conditions
      if (localTime === "10:00") {
        // Good Morning (fixed at 10 AM, always sent)
        reminderType = "good_morning";
        const idx = Math.floor(Math.random() * MORNING_MESSAGES.length);
        messageTemplate = MORNING_MESSAGES[idx];
      } else if (localTime === morningTime) {
        // Morning Planner Reminder (configurable time, only if morning is incomplete)
        if (!morningDone) {
          reminderType = "morning_reminder";
          messageTemplate = "Time to fill in your morning planner. Start your day with intention, {name}! ☀️";
        }
      }

      if (localTime === "14:00") {
        // Lunch Nudge (fixed at 2 PM, only if morning is incomplete)
        if (!morningDone) {
          reminderType = "lunch_nudge";
          const idx = Math.floor(Math.random() * LUNCH_MESSAGES.length);
          messageTemplate = LUNCH_MESSAGES[idx];
        }
      }

      if (localTime === nightTime) {
        // Night Planner Reminder (configurable time, only if night is incomplete)
        if (!nightDone) {
          reminderType = "night_reminder";
          const idx = Math.floor(Math.random() * NIGHT_MESSAGES.length);
          messageTemplate = NIGHT_MESSAGES[idx];
        }
      }

      // If no matching reminder type triggers for this minute, skip
      if (!reminderType) continue;

      console.log(`[Pending] User ${userId} matches ${reminderType} at local time ${localTime}`);

      // 4. Atomically claim/lock this reminder to prevent duplicate sends
      const { data: claimId, error: claimErr } = await supabase.rpc('claim_reminder_log', {
        p_user_id: userId,
        p_entry_date: localDate,
        p_reminder_type: reminderType,
      });

      if (claimErr || !claimId) {
        console.log(`[Skipped] User ${userId} reminder ${reminderType} already sent, pending, or claimed.`);
        continue;
      }

      // 5. Send push notification via OneSignal API
      const messageText = messageTemplate.replace("{name}", userName);
      
      const payload = {
        app_id: ONESIGNAL_APP_ID,
        contents: { en: messageText },
        headings: { en: "Daylight Planner" },
        include_aliases: { external_id: [userId] },
        target_channel: "push",
      };

      try {
        const response = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${onesignalApiKey}`,
          },
          body: JSON.stringify(payload),
        });

        const resData = await response.json();

        if (response.ok && !resData.errors) {
          // Update log to 'sent'
          await supabase
            .from('reminder_log')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', claimId);
          
          console.log(`[Success] Sent push to user ${userId} (${reminderType})`);
          results.push({ userId, type: reminderType, status: 'sent' });
        } else {
          const errMsg = JSON.stringify(resData.errors || resData);
          console.error(`[Failed] OneSignal rejected push for user ${userId}:`, errMsg);
          
          await supabase
            .from('reminder_log')
            .update({ status: 'failed', error_message: errMsg })
            .eq('id', claimId);
          
          results.push({ userId, type: reminderType, status: 'failed', error: errMsg });
        }
      } catch (err: any) {
        console.error(`[Failed] Network error sending push to user ${userId}:`, err);
        
        await supabase
          .from('reminder_log')
          .update({ status: 'failed', error_message: err.message || String(err) })
          .eq('id', claimId);

        results.push({ userId, type: reminderType, status: 'failed', error: err.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, details: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Unhandled scheduler error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
