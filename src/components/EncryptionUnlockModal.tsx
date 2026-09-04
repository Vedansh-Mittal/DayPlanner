import React, { useState } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { useAuthStore } from '../stores/auth-store';
import { Lock, Key, ShieldCheck, AlertCircle, Loader2, ArrowRight, Eye, EyeOff, X } from 'lucide-react';

export const EncryptionUnlockModal: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const {
    showUnlockModal,
    setShowUnlockModal,
    unlockWithPassphrase,
    unlockWithRecoveryKey,
    changePassphrase,
  } = useCrypto();

  const [mode, setMode] = useState<'password' | 'recovery' | 'reset-password'>('password');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    return !!sessionStorage.getItem('dayplanner_welcome_shown');
  });
  const passwordInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleDismiss = () => setWelcomeDismissed(true);
    window.addEventListener('dayplanner_welcome_dismissed', handleDismiss);
    return () => window.removeEventListener('dayplanner_welcome_dismissed', handleDismiss);
  }, []);

  React.useEffect(() => {
    if (showUnlockModal && welcomeDismissed && mode === 'password') {
      const timer = setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showUnlockModal, welcomeDismissed, mode]);

  // Only show the unlock modal if encryption requires unlocking AND the welcome screen has already been dismissed!
  if (!showUnlockModal || !welcomeDismissed) return null;

  const handleClose = () => {
    setShowUnlockModal(false);
  };

  const handleUnlockPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const success = await unlockWithPassphrase(password);
      if (!success) {
        setError('Incorrect password. Please try again or use your recovery file.');
      } else {
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to unlock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryInput.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const success = await unlockWithRecoveryKey(recoveryInput);
      if (!success) {
        setError('Invalid recovery key or file content.');
      } else {
        setMode('reset-password');
        setSuccessMsg('Recovery verified! Now set a new password to protect your journal.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to verify recovery key.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.recoveryKey) {
          setRecoveryInput(parsed.recoveryKey);
          setError(null);
        } else {
          setError('File does not contain a valid recoveryKey field.');
        }
      } catch {
        setError('Could not parse JSON recovery file.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ok = await changePassphrase(newPassword);
      if (ok) {
        setMode('password');
        setPassword('');
        setRecoveryInput('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError('Failed to update password. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-surface dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl p-6 shadow-2xl">
        {/* Dismiss / Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-cream-dark dark:hover:bg-dark-surface transition-colors"
          title="Dismiss"
          aria-label="Close unlock modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="flex items-center space-x-3 mb-5 pr-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary dark:text-dark-text">
              {mode === 'reset-password' ? 'Set New Password' : 'Unlock Your Journal'}
            </h2>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary font-medium">
              Zero-Knowledge End-to-End Encryption
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Mode: Enter Password */}
        {mode === 'password' && (
          <form onSubmit={handleUnlockPassword} className="space-y-4">
            {/* Hidden username input so browsers and password managers (Keychain, Chrome, Touch ID) link this password to the user's account */}
            <input
              type="text"
              name="username"
              id="unlock-username"
              value={user?.email || ''}
              autoComplete="username"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only pointer-events-none"
            />

            <p className="text-xs text-text-muted dark:text-dark-muted">
              Enter or autofill your encryption password to unlock and decrypt your journal.
            </p>

            <div className="relative">
              <input
                ref={passwordInputRef}
                id="unlock-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your encryption password"
                autoComplete="current-password"
                autoFocus
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Unlocking Journal...</span>
                </>
              ) : (
                <>
                  <span>Unlock Journal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 border-t border-border dark:border-dark-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMode('recovery');
                  setError(null);
                }}
                className="text-xs text-amber-500 hover:underline font-medium"
              >
                Forgot password? Use Recovery Key
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}

        {/* Mode: Recovery Key / File */}
        {mode === 'recovery' && (
          <form onSubmit={handleUnlockRecovery} className="space-y-4">
            <p className="text-xs text-text-muted dark:text-dark-muted">
              Upload your <code>daylight-recovery-key.json</code> file or enter your 16-character recovery key.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-text-primary dark:text-dark-text">
                Option 1: Upload recovery file
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="block w-full text-xs text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500/10 file:text-amber-500 hover:file:bg-amber-500/20"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-text-primary dark:text-dark-text">
                Option 2: Paste recovery key
              </label>
              <input
                type="text"
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
                placeholder="e.g. XKPQ-7HNT-4B2M-9W8Y"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-sm font-mono text-text-primary dark:text-dark-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !recoveryInput.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Recovery Key...</span>
                </>
              ) : (
                <>
                  <span>Recover Master Key</span>
                  <Key className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 border-t border-border dark:border-dark-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMode('password');
                  setError(null);
                }}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                ← Back to password unlock
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}

        {/* Mode: Reset Password after recovery */}
        {mode === 'reset-password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <input
              type="text"
              name="username"
              value={user?.email || ''}
              autoComplete="username"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only pointer-events-none"
            />

            <p className="text-xs text-text-muted dark:text-dark-muted">
              Choose a new password to protect your journal on this and future devices.
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary dark:text-dark-text">
                New Password (min 8 chars)
              </label>
              <input
                id="reset-new-password"
                name="password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full px-4 py-2 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary dark:text-dark-text">
                Confirm New Password
              </label>
              <input
                id="reset-confirm-password"
                name="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                className="w-full px-4 py-2 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Key Wrapper...</span>
                </>
              ) : (
                <span>Save New Password & Unlock</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
