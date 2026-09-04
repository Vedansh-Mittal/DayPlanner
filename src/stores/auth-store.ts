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

    const { data: { session } } = await supabase.auth.getSession();

    set({
      session,
      user: session?.user ?? null,
      loading: false,
      initialized: true,
    });

    // Listen for auth changes (token refresh, sign-in, sign-out)
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        loading: false,
      });
    });
  },

  signOut: async () => {
    try {
      localStorage.removeItem('daylight_dek_device');
      sessionStorage.removeItem('daylight_dek_device');
      sessionStorage.removeItem('daylight_session_unlocked');
      sessionStorage.removeItem('dayplanner_welcome_shown');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('daylight_dek_device')) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('Error clearing encryption storage on signOut:', e);
    }
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));

