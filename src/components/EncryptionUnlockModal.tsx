import React, { useState } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { Lock, Key, ShieldCheck, FileText, AlertCircle, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';

export const EncryptionUnlockModal: React.FC = () => {
  const {
    showUnlockModal,
    unlockWithPassphrase,
    unlockWithRecoveryKey,
    changePassphrase,
  } = useCrypto();

  const [mode, setMode] = useState<'passphrase' | 'recovery' | 'reset-passphrase'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!showUnlockModal) return null;

  const handleUnlockPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const success = await unlockWithPassphrase(passphrase);
      if (!success) {
        setError('Incorrect passphrase. Please try again or use your recovery file.');
      } else {
        setPassphrase('');
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
        // Successfully recovered! Move to reset-passphrase so they have a fresh passphrase
        setMode('reset-passphrase');
        setSuccessMsg('Recovery verified! Now set a new passphrase to protect your journal.');
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

  const handleResetPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassphrase.length < 8) {
      setError('Passphrase must be at least 8 characters long.');
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ok = await changePassphrase(newPassphrase);
      if (ok) {
        setMode('passphrase');
        setPassphrase('');
        setRecoveryInput('');
        setNewPassphrase('');
        setConfirmPassphrase('');
        // Modal will automatically close because DEK is unlocked
      } else {
        setError('Failed to update passphrase. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating passphrase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-card-bg dark:bg-dark-card border border-border-default dark:border-dark-border rounded-2xl p-6 shadow-2xl">
        {/* Header Icon */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary dark:text-dark-text">
              {mode === 'reset-passphrase' ? 'Set New Passphrase' : 'Unlock Your Journal'}
            </h2>
            <p className="text-xs text-text-muted dark:text-dark-muted">
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

        {/* Mode: Enter Passphrase */}
        {mode === 'passphrase' && (
          <form onSubmit={handleUnlockPassphrase} className="space-y-4">
            <p className="text-xs text-text-muted dark:text-dark-muted">
              Enter your journal passphrase to decrypt your reflections in this browser session.
            </p>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your encryption passphrase"
                autoFocus
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-sm text-text-primary dark:text-dark-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
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
              disabled={loading || !passphrase.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Decrypting Master Key...</span>
                </>
              ) : (
                <>
                  <span>Unlock Journal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 border-t border-border-default dark:border-dark-border text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('recovery');
                  setError(null);
                }}
                className="text-xs text-amber-500 hover:underline font-medium"
              >
                Forgot passphrase? Use Recovery File / Key
              </button>
            </div>
          </form>
        )}

        {/* Mode: Recovery Key / File */}
        {mode === 'recovery' && (
          <form onSubmit={handleUnlockRecovery} className="space-y-4">
            <p className="text-xs text-text-muted dark:text-dark-muted">
              Upload your <code>daylight-recovery-key.json</code> file or paste your 16-character recovery key.
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
                className="w-full px-4 py-2.5 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-sm font-mono text-text-primary dark:text-dark-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
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

            <div className="pt-2 border-t border-border-default dark:border-dark-border text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('passphrase');
                  setError(null);
                }}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                ← Back to passphrase unlock
              </button>
            </div>
          </form>
        )}

        {/* Mode: Reset Passphrase after recovery */}
        {mode === 'reset-passphrase' && (
          <form onSubmit={handleResetPassphrase} className="space-y-4">
            <p className="text-xs text-text-muted dark:text-dark-muted">
              Choose a new passphrase to protect your journal on this and future devices.
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary dark:text-dark-text">
                New Passphrase (min 8 chars)
              </label>
              <input
                type="password"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                placeholder="New passphrase"
                className="w-full px-4 py-2 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary dark:text-dark-text">
                Confirm New Passphrase
              </label>
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Repeat new passphrase"
                className="w-full px-4 py-2 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !newPassphrase || !confirmPassphrase}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Key Wrapper...</span>
                </>
              ) : (
                <span>Save New Passphrase & Unlock</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
