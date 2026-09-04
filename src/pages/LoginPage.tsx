import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, getAppUrl } from '../lib/supabase';
import { Sun, Mail, ArrowRight, Check, Loader2, KeyRound } from 'lucide-react';

/* [TAG: OTP_AND_MAGIC_LINK_RESILIENCE_V1] */
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(true);

  // 6-digit OTP code state
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${getAppUrl()}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      try {
        sessionStorage.removeItem('daylight_session_unlocked');
        sessionStorage.removeItem('daylight_dek_device');
        sessionStorage.removeItem('dayplanner_welcome_shown');
      } catch (e) {
        // ignore
      }
      setSent(true);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanToken = otp.trim();
    if (cleanToken.length < 6) return;

    setVerifying(true);
    setOtpError(null);

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanToken,
        type: 'email',
      });

      if (verifyError) {
        setOtpError(verifyError.message || 'Invalid or expired code. Please check your email.');
        setVerifying(false);
        return;
      }

      if (data.session) {
        try {
          sessionStorage.removeItem('daylight_session_unlocked');
          sessionStorage.removeItem('daylight_dek_device');
          sessionStorage.removeItem('dayplanner_welcome_shown');
          localStorage.removeItem('daylight_dek_device');
          if (data.session.user?.id) {
            localStorage.removeItem(`daylight_dek_device_${data.session.user.id}`);
          }
        } catch (e) {
          // ignore
        }

        const { data: settings } = await supabase
          .from('user_settings')
          .select('onboarding_complete')
          .eq('user_id', data.session.user.id)
          .maybeSingle();

        if (settings?.onboarding_complete) {
          navigate('/app', { replace: true });
        } else {
          navigate('/onboarding', { replace: true });
        }
      }
    } catch (err: any) {
      setOtpError(err.message || 'Verification failed. Please try again.');
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-dark-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 fade-in">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-xl ring-4 ring-lavender/40 flex items-center justify-center mb-4">
            <img src="/mewwmory-icon.png" alt="Mewwmory" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-extrabold text-text-primary dark:text-dark-text tracking-tight">
            Mewwmory
          </h1>
          <p className="text-text-secondary dark:text-dark-text-secondary mt-2 text-center">
            A calm, private space for your daily reflections.
          </p>
        </div>

        {/* Form card */}
        <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="magic-email-destination" className="block text-sm font-semibold text-text-secondary dark:text-dark-text-secondary">
                    Email address
                  </label>
                  <span className="text-[11px] font-semibold text-lavender-dark dark:text-lavender bg-lavender/10 dark:bg-lavender/20 px-2 py-0.5 rounded-full">
                    Magic link or code
                  </span>
                </div>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    id="magic-email-destination"
                    name="magic_link_email"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-form-type="other"
                    readOnly={isReadOnly}
                    onFocus={() => setIsReadOnly(false)}
                    onClick={() => setIsReadOnly(false)}
                    onTouchStart={() => setIsReadOnly(false)}
                    className="input-field pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary w-full py-3"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Send Login Link & Code
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="pt-1 text-center space-y-1">
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  ✨ No password needed. We'll email you a secure link and a 6-digit code.
                </p>
              </div>
            </form>
          ) : (
            <div className="text-center py-2 space-y-4">
              <div className="w-14 h-14 rounded-full bg-mint-light dark:bg-mint/20 flex items-center justify-center mx-auto text-green-600">
                <Check size={28} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Check your email!</h2>
                <p className="text-text-secondary dark:text-dark-text-secondary text-sm mt-1">
                  We sent a login code and link to <strong>{email}</strong>.
                </p>
              </div>

              {/* 6-digit OTP Code Input */}
              <form onSubmit={handleVerifyOtp} className="pt-2 text-left space-y-3">
                <div className="border-t border-border/60 dark:border-dark-border/60 pt-4">
                  <label htmlFor="otp-code-input" className="block text-xs font-semibold uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary mb-1.5 text-center flex items-center justify-center gap-1.5">
                    <KeyRound size={14} className="text-lavender" />
                    Enter the 6-digit code from email
                  </label>
                  <input
                    id="otp-code-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    placeholder="123456"
                    className="input-field text-center font-mono text-2xl tracking-[0.25em] font-bold py-2.5"
                    value={otp}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      setOtp(clean);
                      if (otpError) setOtpError(null);
                    }}
                    disabled={verifying}
                  />

                  {otpError && (
                    <p className="text-xs text-red-500 mt-2 text-center bg-red-50 dark:bg-red-900/20 py-1.5 px-3 rounded-lg">
                      {otpError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={verifying || otp.trim().length < 6}
                    className="btn-primary w-full mt-3 py-2.5 flex items-center justify-center gap-2 font-semibold"
                  >
                    {verifying ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Alternative option: Magic Link Notice */}
              <div className="border-t border-border/40 dark:border-dark-border/40 pt-3">
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  Or tap the magic link button directly in the email to log in.
                </p>
              </div>

              <button
                type="button"
                className="btn-ghost mx-auto text-xs py-1"
                onClick={() => { setSent(false); setEmail(''); setOtp(''); setOtpError(null); }}
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
