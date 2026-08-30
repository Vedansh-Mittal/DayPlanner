import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Notification message templates ──────────────────────────

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

// ── Web Push VAPID utilities ────────────────────────────────

function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importVapidKeys(publicKeyB64: string, privateKeyB64: string) {
  const publicKeyBytes = base64UrlDecode(publicKeyB64);
  const privateKeyBytes = base64UrlDecode(privateKeyB64);
  
  const publicKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    []
  );
  
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
      y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
      d: base64UrlEncode(privateKeyBytes),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
  
  return { publicKey, privateKey, publicKeyBytes };
}

async function createVapidAuthHeader(
  endpoint: string,
  vapidPublicKeyB64: string,
  vapidPrivateKeyB64: string,
  subject: string,
) {
  const { privateKey, publicKeyBytes } = await importVapidKeys(vapidPublicKeyB64, vapidPrivateKeyB64);
  
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: now + 12 * 3600, // 12h
    sub: subject,
  };
  
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsigned),
  );

  // Convert DER signature to raw r||s (64 bytes)
  const sigBytes = new Uint8Array(signature);
  let rawSig: Uint8Array;
  
  if (sigBytes.length === 64) {
    rawSig = sigBytes;
  } else {
    // DER decode
    let offset = 2; // skip 0x30 + length
    if (sigBytes[1] > 128) offset += (sigBytes[1] - 128);

    const rLen = sigBytes[offset + 1];
    const rStart = offset + 2;
    const r = sigBytes.slice(rStart, rStart + rLen);

    const sOffset = rStart + rLen;
    const sLen = sigBytes[sOffset + 1];
    const sStart = sOffset + 2;
    const s = sigBytes.slice(sStart, sStart + sLen);

    rawSig = new Uint8Array(64);
    rawSig.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
    rawSig.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
  }
  
  const jwt = `${unsigned}.${base64UrlEncode(rawSig)}`;
  const p256ecdsa = base64UrlEncode(publicKeyBytes);
  
  return {
    authorization: `vapid t=${jwt}, k=${p256ecdsa}`,
  };
}

// ── Encryption (aes128gcm, RFC 8291) ────────────────────────

async function encryptPayload(
  payload: string,
  subscriptionEndpoint: string,
  p256dhB64: string,
  authB64: string,
  vapidPublicKeyB64: string,
): Promise<{ body: Uint8Array; contentEncoding: string }> {
  const userPublicKeyBytes = base64UrlDecode(p256dhB64);
  const authSecret = base64UrlDecode(authB64);
  
  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeyPair.publicKey)
  );
  
  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    userPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  
  // ECDH shared secret
  const sharedSecretBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: subscriberKey },
      localKeyPair.privateKey,
      256
    )
  );
  
  // PRK (auth secret info)
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...userPublicKeyBytes,
    ...localPublicKeyRaw,
  ]);
  
  const ikmKey = await crypto.subtle.importKey('raw', sharedSecretBits, { name: 'HKDF' }, false, ['deriveBits']);
  const prkBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: authInfo },
    ikmKey,
    256
  );
  const prkKey = await crypto.subtle.importKey('raw', new Uint8Array(prkBits), { name: 'HKDF' }, false, ['deriveBits']);
  
  // Content encryption key
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: cekInfo },
    prkKey,
    128
  );
  const cek = await crypto.subtle.importKey('raw', new Uint8Array(cekBits), { name: 'AES-GCM' }, false, ['encrypt']);
  
  // Nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: nonceInfo },
    prkKey,
    96
  );
  const nonce = new Uint8Array(nonceBits);
  
  // Pad and encrypt payload
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 2);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // delimiter
  paddedPayload[payloadBytes.length + 1] = 0; // padding
  
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, paddedPayload)
  );
  
  // Build aes128gcm header: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Recalculate with actual salt
  const prkKey2 = await crypto.subtle.importKey('raw', new Uint8Array(prkBits), { name: 'HKDF' }, false, ['deriveBits']);
  
  const recordSize = paddedPayload.length + 16; // payload + tag
  const rs = new DataView(new ArrayBuffer(4));
  rs.setUint32(0, recordSize + 86); // header + record
  
  const body = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length + encrypted.length);
  body.set(salt, 0);
  body.set(new Uint8Array(rs.buffer), 16);
  body[20] = localPublicKeyRaw.length;
  body.set(localPublicKeyRaw, 21);
  body.set(encrypted, 21 + localPublicKeyRaw.length);
  
  return { body, contentEncoding: 'aes128gcm' };
}

// ── Main handler ────────────────────────────────────────────

Deno.serve(async (req) => {
  // 1. Verify Cron Secret
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret || requestSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Environment vars
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

  if (!supabaseUrl || !supabaseServiceKey || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(
      JSON.stringify({ error: "Missing backend configuration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 3. Get pending reminders
    const { data: users, error: fetchErr } = await supabase.rpc('get_pending_reminders');

    if (fetchErr) {
      console.error('Error calling get_pending_reminders:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    console.log(`Processing reminders for ${users?.length || 0} active users...`);
    const results: any[] = [];

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

      // Good Morning (fixed 10 AM)
      if (localTime === "10:00") {
        reminderType = "good_morning";
        messageTemplate = MORNING_MESSAGES[Math.floor(Math.random() * MORNING_MESSAGES.length)];
      } else if (localTime === morningTime && !morningDone) {
        reminderType = "morning_reminder";
        messageTemplate = "Time to fill in your morning planner. Start your day with intention, {name}! ☀️";
      }

      // Lunch nudge (fixed 2 PM, only if morning incomplete)
      if (localTime === "14:00" && !morningDone) {
        reminderType = "lunch_nudge";
        messageTemplate = LUNCH_MESSAGES[Math.floor(Math.random() * LUNCH_MESSAGES.length)];
      }

      // Night reminder (configurable time)
      if (localTime === nightTime && !nightDone) {
        reminderType = "night_reminder";
        messageTemplate = NIGHT_MESSAGES[Math.floor(Math.random() * NIGHT_MESSAGES.length)];
      }

      if (!reminderType) continue;

      console.log(`[Pending] User ${userId} matches ${reminderType} at ${localTime}`);

      // 4. Claim to prevent duplicates
      const { data: claimId, error: claimErr } = await supabase.rpc('claim_reminder_log', {
        p_user_id: userId,
        p_entry_date: localDate,
        p_reminder_type: reminderType,
      });

      if (claimErr || !claimId) {
        console.log(`[Skipped] Already sent for user ${userId} / ${reminderType}`);
        continue;
      }

      // 5. Get push subscriptions for this user
      const { data: subscriptions, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (subErr || !subscriptions?.length) {
        console.log(`[Skipped] No push subscriptions for user ${userId}`);
        await supabase
          .from('reminder_log')
          .update({ status: 'failed', error_message: 'No push subscriptions found' })
          .eq('id', claimId);
        results.push({ userId, type: reminderType, status: 'no_subscription' });
        continue;
      }

      // 6. Send push to each subscription
      const messageText = messageTemplate.replace("{name}", userName);
      const pushPayload = JSON.stringify({
        title: "Daylight Planner",
        body: messageText,
      });

      let sentAny = false;
      for (const sub of subscriptions) {
        try {
          const { authorization } = await createVapidAuthHeader(
            sub.endpoint,
            vapidPublicKey,
            vapidPrivateKey,
            'mailto:dayplanner@example.com',
          );

          const { body: encryptedBody } = await encryptPayload(
            pushPayload,
            sub.endpoint,
            sub.p256dh,
            sub.auth,
            vapidPublicKey,
          );

          const pushRes = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Authorization': authorization,
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'aes128gcm',
              'TTL': '86400',
              'Urgency': 'normal',
            },
            body: encryptedBody,
          });

          if (pushRes.ok || pushRes.status === 201) {
            console.log(`[Success] Push sent to ${sub.endpoint.slice(0, 60)}...`);
            sentAny = true;
          } else {
            const errText = await pushRes.text();
            console.error(`[Failed] Push ${pushRes.status}: ${errText}`);
            
            // If endpoint is gone (410 Gone or 404), clean up
            if (pushRes.status === 410 || pushRes.status === 404) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', sub.endpoint)
                .eq('user_id', userId);
              console.log(`[Cleanup] Removed expired subscription`);
            }
          }
        } catch (pushErr: any) {
          console.error(`[Failed] Push error: ${pushErr.message}`);
        }
      }

      // Update log
      if (sentAny) {
        await supabase
          .from('reminder_log')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', claimId);
        results.push({ userId, type: reminderType, status: 'sent' });
      } else {
        await supabase
          .from('reminder_log')
          .update({ status: 'failed', error_message: 'All push endpoints failed' })
          .eq('id', claimId);
        results.push({ userId, type: reminderType, status: 'failed' });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, details: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
