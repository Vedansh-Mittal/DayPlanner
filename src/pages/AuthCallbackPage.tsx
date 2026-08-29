import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Sun, Loader2 } from 'lucide-react';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase handles the token exchange from the URL hash/query automatically
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError) {
          setError(authError.message);
          return;
        }

        if (session) {
          // Check if user has completed onboarding
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
        } else {
          setError('No session found. The link may have expired.');
        }
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-dark-bg">
      <div className="flex flex-col items-center gap-4 fade-in">
        {error ? (
          <div className="card text-center max-w-md">
            <p className="text-red-500 font-semibold mb-4">{error}</p>
            <button
              className="btn-primary"
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to Login
            </button>
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
