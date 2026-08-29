# Daylight Planner ☀️

A calm, private daily planner for morning and evening reflections, mood tracking, habit logging, and personal insights.

## Quick Start

### 1. Apply the Database Schema

Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/lyhcwyzxixpetcplescl/sql/new) and paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql), then click **Run**.

This creates all tables, RLS policies, indexes, and the `search_entries` RPC function.

### 2. Configure Supabase Auth

In the Supabase Dashboard under **Authentication → URL Configuration**:

- **Site URL**: Set to your app URL (e.g., `http://localhost:5173` for local dev)
- **Redirect URLs**: Add `http://localhost:5173/auth/callback`

Under **Authentication → Email Templates → Magic Link**:

- Make sure the template includes `{{ .ConfirmationURL }}` for the redirect link.

### 3. Install and Run

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:5173
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 (CSS-based config)
- **Backend**: Supabase (Auth, PostgreSQL, RLS)
- **State**: Zustand
- **Icons**: Lucide React
- **Dates**: date-fns

## Features

- ✅ Passwordless Magic Link authentication
- ✅ Multi-step onboarding (name, timezone, reminders, water goal)
- ✅ Morning planner (mood, motivation, priorities, actions, brain dump)
- ✅ Night planner (mood, medication, meals, hydration, gratitude, reflection, wind-down)
- ✅ Daily note (searchable)
- ✅ Auto-save with debounce and save status indicator
- ✅ Date navigation (previous/next/today)
- ✅ History page with monthly calendar and full-text search
- ✅ Insights page with deterministic analysis of real user data
- ✅ Settings (profile, timezone, reminders, water goal, theme, logout, data deletion)
- ✅ Light / Dark / System theme with persistence
- ✅ Row Level Security on every table
- ✅ Mobile-responsive layout (sidebar on desktop, bottom nav on mobile)

## Project Structure

```
src/
├── main.tsx                 # App bootstrap
├── App.tsx                  # Routes
├── index.css                # Design system (Tailwind v4)
├── lib/
│   ├── supabase.ts          # Supabase client
│   ├── utils.ts             # Helpers
│   └── insights-engine.ts   # Deterministic insights
├── stores/
│   ├── auth-store.ts        # Auth state (Zustand)
│   └── theme-store.ts       # Theme state (Zustand)
├── hooks/
│   ├── useDailyEntry.ts     # Entry CRUD + auto-save
│   └── useUserSettings.ts   # Settings CRUD
├── components/
│   ├── AuthGuard.tsx         # Route protection
│   ├── AppLayout.tsx         # Sidebar/nav layout
│   ├── MoodSelector.tsx      # Mood picker
│   ├── SaveStatus.tsx        # Save indicator
│   ├── MorningPlanner.tsx    # Morning sections
│   └── NightPlanner.tsx      # Night sections
├── pages/
│   ├── LoginPage.tsx
│   ├── AuthCallbackPage.tsx
│   ├── OnboardingPage.tsx
│   ├── PlannerPage.tsx
│   ├── HistoryPage.tsx
│   ├── InsightsPage.tsx
│   └── SettingsPage.tsx
└── types/
    └── database.ts           # TypeScript types
```
