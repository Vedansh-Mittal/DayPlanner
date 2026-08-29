import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    let loginTime = localStorage.getItem('dayplanner_login_time');
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      if (!loginTime) {
        loginTime = String(Date.now());
        localStorage.setItem('dayplanner_login_time', loginTime);
      }
      const elapsed = Date.now() - Number(loginTime);
      if (elapsed > 7 * 60 * 1000) {
        localStorage.removeItem('dayplanner_login_time');
        await supabase.auth.signOut();
        set({ session: null, user: null, loading: false, initialized: true });
        return;
      }
    } else {
      localStorage.removeItem('dayplanner_login_time');
    }

    set({
      session,
      user: session?.user ?? null,
      loading: false,
      initialized: true,
    });

    // Listen for auth changes
    let logoutTimer: ReturnType<typeof setTimeout> | null = null;

    supabase.auth.onAuthStateChange((_event, session) => {
      if (logoutTimer) clearTimeout(logoutTimer);

      if (session) {
        let lTime = localStorage.getItem('dayplanner_login_time');
        if (!lTime) {
          lTime = String(Date.now());
          localStorage.setItem('dayplanner_login_time', lTime);
        }
        const remaining = 7 * 60 * 1000 - (Date.now() - Number(lTime));
        if (remaining <= 0) {
          localStorage.removeItem('dayplanner_login_time');
          supabase.auth.signOut();
          set({ session: null, user: null });
        } else {
          set({ session, user: session.user, loading: false });
          logoutTimer = setTimeout(() => {
            localStorage.removeItem('dayplanner_login_time');
            supabase.auth.signOut();
            set({ session: null, user: null });
          }, remaining);
        }
      } else {
        localStorage.removeItem('dayplanner_login_time');
        set({ session: null, user: null, loading: false });
      }
    });
  },

  signOut: async () => {
    localStorage.removeItem('dayplanner_login_time');
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
