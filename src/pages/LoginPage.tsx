import React, { useState } from 'react';
import { supabase, getAppUrl } from '../lib/supabase';
import { Sun, Mail, ArrowRight, Check, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(true);

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
      setSent(true);
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
                    Magic link only
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
                    Send Magic Link
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="pt-1 text-center space-y-1">
                <p className="text-xs text-text-muted dark:text-dark-text-muted">
                  ✨ No password needed to sign in. We'll email you a secure link.
                </p>
                <p className="text-[11px] text-text-muted/80 dark:text-dark-text-muted/80">
                  Your encryption password is only used to decrypt your journal after logging in.
                </p>
              </div>
            </form>
          ) : (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-mint-light dark:bg-mint/20 flex items-center justify-center mx-auto">
                <Check size={28} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold">Check your email!</h2>
              <p className="text-text-secondary dark:text-dark-text-secondary">
                We sent a magic link to <strong>{email}</strong>.
                <br />
                Click the link to sign in.
              </p>
              <button
                type="button"
                className="btn-ghost mx-auto"
                onClick={() => { setSent(false); setEmail(''); }}
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
