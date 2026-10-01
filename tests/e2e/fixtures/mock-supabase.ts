import { Page, Route } from '@playwright/test';

export interface MockUserOptions {
  id?: string;
  email?: string;
  displayName?: string;
  onboardingComplete?: boolean;
  encryptionEnabled?: boolean;
  encryptionSalt?: string;
  wrappedKeyPassphrase?: string;
  wrappedKeyRecovery?: string;
  keyVerifier?: string;
}

export interface MockDatabaseState {
  user: {
    id: string;
    email: string;
  };
  settings: Record<string, any>;
  personalisation: Record<string, any>;
  dailyEntries: Map<string, any>; // keyed by entry_date or id
  priorities: Map<string, any[]>; // keyed by daily_entry_id
  actionSteps: Map<string, any[]>;
  meals: Map<string, any[]>;
  medications: Map<string, any[]>;
  windDownItems: Map<string, any[]>;
}

export const DEFAULT_MOCK_USER: Required<MockUserOptions> = {
  id: 'e2e-user-12345',
  email: 'tester@daylight.app',
  displayName: 'Alex',
  onboardingComplete: true,
  encryptionEnabled: false,
  encryptionSalt: '',
  wrappedKeyPassphrase: '',
  wrappedKeyRecovery: '',
  keyVerifier: '',
};

/**
 * Creates in-memory state and attaches Playwright route intercepts
 * to mock all Supabase Auth, REST (PostgREST), and Edge Functions.
 */
export async function setupSupabaseMocks(page: Page, options: MockUserOptions = {}) {
  const mergedOptions = { ...DEFAULT_MOCK_USER, ...options };
  const userId = mergedOptions.id;

  const dbState: MockDatabaseState = {
    user: {
      id: userId,
      email: mergedOptions.email,
    },
    settings: {
      user_id: userId,
      display_name: mergedOptions.displayName,
      timezone: 'UTC',
      morning_reminder: '08:00',
      night_reminder: '21:00',
      water_goal: 8,
      email_reminders: false,
      theme: 'system',
      onboarding_complete: mergedOptions.onboardingComplete,
      encryption_enabled: mergedOptions.encryptionEnabled,
      encryption_salt: mergedOptions.encryptionSalt || null,
      wrapped_key_passphrase: mergedOptions.wrappedKeyPassphrase || null,
      wrapped_key_recovery: mergedOptions.wrappedKeyRecovery || null,
      key_verifier: mergedOptions.keyVerifier || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    personalisation: {
      user_id: userId,
      life_stage: 'Professional',
      primary_focus: ['Focus', 'Calm'],
      support_style: 'Gentle',
      voice_persona: 'Warm Friend',
      updated_at: new Date().toISOString(),
    },
    dailyEntries: new Map(),
    priorities: new Map(),
    actionSteps: new Map(),
    meals: new Map(),
    medications: new Map(),
    windDownItems: new Map(),
  };

  // 1. Mock Supabase Auth OTP request
  await page.route('**/auth/v1/otp', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: corsHeaders() });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify({}),
    });
  });

  // 2. Mock Supabase Auth Verify OTP request
  await page.route('**/auth/v1/verify', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: corsHeaders() });
    }
    const postData = route.request().postDataJSON() || {};
    const token = postData.token;

    // Reject '000000' or malformed tokens for error-handling tests
    if (token === '000000' || token === '999999') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify({
          error: 'invalid_grant',
          message: 'Invalid or expired code. Please check your email.',
        }),
      });
    }

    const sessionPayload = createMockSession(dbState.user);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify(sessionPayload),
    });
  });

  // 3. Mock Supabase Auth User & Token Session
  await page.route('**/auth/v1/user', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify(createMockUser(dbState.user)),
    });
  });

  await page.route('**/auth/v1/token*', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify(createMockSession(dbState.user)),
    });
  });

  await page.route('**/auth/v1/logout', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify({}),
    });
  });

  // 4. Mock REST: user_settings
  await page.route('**/rest/v1/user_settings*', async (route) => {
    const method = route.request().method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: corsHeaders() });
    }

    if (method === 'GET') {
      const isSingle = route.request().headers()['accept']?.includes('vnd.pgrst.object+json');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify(isSingle ? dbState.settings : [dbState.settings]),
      });
    }

    if (method === 'PATCH' || method === 'POST') {
      const updateData = route.request().postDataJSON() || {};
      dbState.settings = { ...dbState.settings, ...updateData, updated_at: new Date().toISOString() };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify(dbState.settings),
      });
    }

    return route.continue();
  });

  // 5. Mock REST: user_personalisation
  await page.route('**/rest/v1/user_personalisation*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify([dbState.personalisation]),
      });
    }
    if (method === 'PATCH' || method === 'POST') {
      const data = route.request().postDataJSON() || {};
      dbState.personalisation = { ...dbState.personalisation, ...data };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify(dbState.personalisation),
      });
    }
    return route.fulfill({ status: 200, headers: corsHeaders() });
  });

  // 6. Mock REST: daily_entries
  await page.route('**/rest/v1/daily_entries*', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: corsHeaders() });
    }

    if (method === 'GET') {
      const dateMatch = url.searchParams.get('entry_date')?.replace('eq.', '');
      const isSingle = route.request().headers()['accept']?.includes('vnd.pgrst.object+json');

      if (dateMatch) {
        let entry = Array.from(dbState.dailyEntries.values()).find((e) => e.entry_date === dateMatch);
        if (!entry) {
          return route.fulfill({
            status: isSingle ? 404 : 200,
            contentType: 'application/json',
            headers: corsHeaders(),
            body: JSON.stringify(isSingle ? { code: 'PGRST116', message: 'Row not found' } : []),
          });
        }

        // Attach relations
        const entryWithChildren = {
          ...entry,
          priorities: dbState.priorities.get(entry.id) || [],
          action_steps: dbState.actionSteps.get(entry.id) || [],
          meals: dbState.meals.get(entry.id) || [],
          medications: dbState.medications.get(entry.id) || [],
          wind_down_items: dbState.windDownItems.get(entry.id) || [],
        };

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders(),
          body: JSON.stringify(isSingle ? entryWithChildren : [entryWithChildren]),
        });
      }

      // Return all entries
      const allEntries = Array.from(dbState.dailyEntries.values()).map((entry) => ({
        ...entry,
        priorities: dbState.priorities.get(entry.id) || [],
        action_steps: dbState.actionSteps.get(entry.id) || [],
        meals: dbState.meals.get(entry.id) || [],
        medications: dbState.medications.get(entry.id) || [],
        wind_down_items: dbState.windDownItems.get(entry.id) || [],
      }));

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify(allEntries),
      });
    }

    if (method === 'POST') {
      // Upsert entry
      const body = route.request().postDataJSON() || {};
      const targetDate = body.entry_date;
      let existing = Array.from(dbState.dailyEntries.values()).find((e) => e.entry_date === targetDate);
      const entryId = existing?.id || body.id || `entry-${Date.now()}`;

      const savedEntry = {
        ...existing,
        ...body,
        id: entryId,
        user_id: userId,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      dbState.dailyEntries.set(entryId, savedEntry);

      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify(savedEntry),
      });
    }

    if (method === 'PATCH') {
      const idMatch = url.searchParams.get('id')?.replace('eq.', '');
      const body = route.request().postDataJSON() || {};
      if (idMatch && dbState.dailyEntries.has(idMatch)) {
        const entry = dbState.dailyEntries.get(idMatch);
        const updated = { ...entry, ...body, updated_at: new Date().toISOString() };
        dbState.dailyEntries.set(idMatch, updated);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders(),
          body: JSON.stringify(updated),
        });
      }
      return route.fulfill({ status: 200, headers: corsHeaders(), body: JSON.stringify(body) });
    }

    if (method === 'DELETE') {
      const idMatch = url.searchParams.get('id')?.replace('eq.', '');
      if (idMatch) {
        dbState.dailyEntries.delete(idMatch);
        dbState.priorities.delete(idMatch);
        dbState.actionSteps.delete(idMatch);
        dbState.meals.delete(idMatch);
        dbState.medications.delete(idMatch);
        dbState.windDownItems.delete(idMatch);
      }
      return route.fulfill({ status: 204, headers: corsHeaders() });
    }

    return route.continue();
  });

  // 7. Mock REST: priorities
  await page.route('**/rest/v1/priorities*', async (route) => {
    handleChildCollection(route, dbState.priorities, 'priorities');
  });

  // 8. Mock REST: action_steps
  await page.route('**/rest/v1/action_steps*', async (route) => {
    handleChildCollection(route, dbState.actionSteps, 'action_steps');
  });

  // 9. Mock REST: meals
  await page.route('**/rest/v1/meals*', async (route) => {
    handleChildCollection(route, dbState.meals, 'meals');
  });

  // 10. Mock REST: medications
  await page.route('**/rest/v1/medications*', async (route) => {
    handleChildCollection(route, dbState.medications, 'medications');
  });

  // 11. Mock REST: wind_down_items
  await page.route('**/rest/v1/wind_down_items*', async (route) => {
    handleChildCollection(route, dbState.windDownItems, 'wind_down_items');
  });

  // 12. Mock RPC: search_entries
  await page.route('**/rest/v1/rpc/search_entries*', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify([]),
    });
  });

  // 13. Mock Edge Functions
  await page.route('**/functions/v1/generate-insight', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders(),
      body: JSON.stringify({
        type: 'success',
        text: 'Looking across your reflections, your consistency with daily priorities has been high. Keep nurturing your mindful pace! 🌸',
        dateRange: { start: '2026-09-25', end: '2026-10-02' },
        entryCount: 5,
      }),
    });
  });

  return dbState;
}

function handleChildCollection(route: Route, collectionMap: Map<string, any[]>, name: string) {
  const method = route.request().method();
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: corsHeaders() });

  if (method === 'POST') {
    const body = route.request().postDataJSON();
    const rows = Array.isArray(body) ? body : [body];
    if (rows.length > 0 && rows[0].daily_entry_id) {
      const entryId = rows[0].daily_entry_id;
      const stampedRows = rows.map((r, i) => ({
        id: r.id || `${name}-${entryId}-${i}-${Date.now()}`,
        ...r,
      }));
      collectionMap.set(entryId, stampedRows);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: corsHeaders(),
        body: JSON.stringify(stampedRows),
      });
    }
    return route.fulfill({ status: 200, headers: corsHeaders(), body: JSON.stringify([]) });
  }

  if (method === 'DELETE') {
    return route.fulfill({ status: 204, headers: corsHeaders() });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: corsHeaders(),
    body: JSON.stringify([]),
  });
}

/**
 * Pre-authenticates the browser session in localStorage so that
 * when the app loads, `useAuthStore.initialize()` detects a logged-in user.
 */
export async function injectAuthenticatedSession(page: Page, options: MockUserOptions = {}) {
  const merged = { ...DEFAULT_MOCK_USER, ...options };
  const session = createMockSession({ id: merged.id, email: merged.email });

  await page.addInitScript(({ sessionData }) => {
    // 1. Bypass splash screens & security notices to keep tests deterministic
    sessionStorage.setItem('dayplanner_welcome_shown', 'true');
    localStorage.setItem('mewwmory_security_notice_v1_shown', 'true');

    // 2. Set Supabase auth tokens in localStorage for known keys
    const raw = JSON.stringify(sessionData);
    localStorage.setItem('sb-lyhcwyzxixpetcplescl-auth-token', raw);
    localStorage.setItem('sb-localhost-auth-token', raw);
    localStorage.setItem('supabase.auth.token', raw);

    // Also set all wildcard matches
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        localStorage.setItem(k, raw);
      }
    }
  }, { sessionData: session });
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  };
}

export function createMockUser(user: { id: string; email: string }) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-10-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };
}

export function createMockSession(user: { id: string; email: string }) {
  return {
    access_token: 'mock-access-token-jwt-daylight',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh-token',
    user: createMockUser(user),
  };
}
