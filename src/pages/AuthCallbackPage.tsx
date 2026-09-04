import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Sun } from 'lucide-react';

/* [TAG: OTP_AND_MAGIC_LINK_RESILIENCE_V1] */
export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let resolved = false;

    const handleSuccess = async (session: any) => {
      if (resolved) return;
      resolved = true;

      try {
        sessionStorage.removeItem('daylight_session_unlocked');
        sessionStorage.removeItem('daylight_dek_device');
        sessionStorage.removeItem('dayplanner_welcome_shown');
        localStorage.removeItem('daylight_dek_device');
        if (session.user?.id) {
          localStorage.removeItem(`daylight_dek_device_${session.user.id}`);
        }
      } catch (e) {
        // ignore
      }

      const { data: settings } = await supabase
        .from('user_settings')
        .select('onboarding_complete')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (settings?.onboarding_complete) {
        navigate('/app', { replace: true });
      } else {
        navigate('/onboarding', { replace: true });
      }
    };

    let cleanupTimer: any = null;
    let cleanupSub: any = null;

    const handleCallback = async () => {
      try {
        // 1. Explicit PKCE code exchange if ?code= is present in URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
          try {
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (data?.session) {
              return handleSuccess(data.session);
            }
          } catch (e) {
            console.warn('PKCE code exchange error:', e);
          }
        }

        // 2. Check current session (hash token auto-exchanged by Supabase)
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (session) {
          return handleSuccess(session);
        }

        // 3. Listen for async auth change (in case background exchange takes a few hundred ms)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (newSession) {
            subscription.unsubscribe();
            return handleSuccess(newSession);
          }
        });
        cleanupSub = subscription;

        // 4. Graceful buffer before displaying fallback error (prevents instant millisecond 1 failure)
        cleanupTimer = setTimeout(() => {
          if (!resolved) {
            if (cleanupSub) cleanupSub.unsubscribe();
            setError(
              'No active login session found in this browser. If you use an installed app or different browser, please enter the 6-digit code from your email directly in the app.'
            );
          }
        }, 3500);

      } catch (err: any) {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    };

    handleCallback();

    return () => {
      if (cleanupTimer) clearTimeout(cleanupTimer);
      if (cleanupSub) cleanupSub.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-dark-bg px-4">
      <div className="flex flex-col items-center gap-4 fade-in max-w-md w-full">
        {error ? (
          <div className="card text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold text-text-primary dark:text-dark-text">Sign-in Link Notice</h2>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary leading-relaxed">
              {error}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                className="btn-primary w-full py-2.5"
                onClick={() => navigate('/login', { replace: true })}
              >
                Back to Login (Enter 6-Digit Code)
              </button>
            </div>
          </div>
        ) : (
          <>
            <Sun size={40} className="text-lavender animate-spin" style={{ animationDuration: '3s' }} />
            <p className="text-text-secondary dark:text-dark-text-secondary font-semibold">
              Signing you in…
            </p>
          </>
        )}
      </div>
    </div>
  );
};
