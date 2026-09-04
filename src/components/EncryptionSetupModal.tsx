import React, { useState } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { useAuthStore } from '../stores/auth-store';
import {
  Shield, Key, Download, CheckCircle2, AlertTriangle,
  Loader2, ArrowRight, Eye, EyeOff, X, Lock,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EncryptionSetupModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { enableEncryption } = useCrypto();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Recovery Key State
  const [recoveryKey, setRecoveryKey] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  // Verification challenge (type 2 segments, e.g. segments #1 and #3)
  const [challengeSeg1, setChallengeSeg1] = useState('');
  const [challengeSeg3, setChallengeSeg3] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Step 2 -> 3: Generate and download
  const handleGenerateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters long.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await enableEncryption(passphrase);
      setRecoveryKey(result.recoveryKey);
      setStep(3);
    } catch (err: any) {
      setError(err?.message || 'Failed to setup encryption. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Download recovery file
  const handleDownloadRecoveryFile = () => {
    const recoveryData = {
      format: 'daylight-recovery-v1',
      userId: user?.id || 'unknown',
      recoveryKey,
      createdAt: new Date().toISOString(),
      warning: 'Keep this file safe and private. It unlocks your encrypted Daylight journal.',
    };

    const blob = new Blob([JSON.stringify(recoveryData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daylight-recovery-key-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloaded(true);
  };

  // Segments for wallet-style verification
  // Recovery key format is "XXXX-XXXX-XXXX-XXXX" -> 4 parts
  const segments = recoveryKey.split('-');
  const expectedSeg1 = segments[0] || '';
  const expectedSeg3 = segments[2] || '';

  const handleVerifyAndFinish = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      challengeSeg1.trim().toUpperCase() !== expectedSeg1.toUpperCase() ||
      challengeSeg3.trim().toUpperCase() !== expectedSeg3.toUpperCase()
    ) {
      setError('The segments you entered do not match your recovery key. Please check your downloaded file.');
      return;
    }

    setStep(4);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-card-bg dark:bg-dark-card border border-border-default dark:border-dark-border rounded-2xl p-6 shadow-2xl">
        {/* Close Button */}
        {step !== 4 && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover dark:hover:bg-dark-surface"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Step Indicator */}
        <div className="flex items-center space-x-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                s === step
                  ? 'bg-amber-500'
                  : s < step
                  ? 'bg-emerald-500'
                  : 'bg-border-default dark:bg-dark-border'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Explanation & Core Trade-off */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">
                  Enable Private Mode (Zero-Knowledge)
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-muted">
                  Mathematical privacy for your personal reflections
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-xs space-y-2.5 text-text-muted dark:text-dark-muted">
              <p>
                <strong className="text-text-primary dark:text-dark-text">What gets encrypted (AES-GCM-256):</strong> Your brain dumps, gratitude logs, daily notes, priorities, and reflections. They are scrambled in your browser before ever touching Supabase. Even database administrators cannot read them.
              </p>
              <p>
                <strong className="text-text-primary dark:text-dark-text">What stays visible:</strong> Mood tags and dates remain plain so your calendar and mood streak charts stay fast. No written reflections are ever included in either.
              </p>
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ <strong>The Zero-Knowledge Rule:</strong> If you lose both your passphrase and your recovery file, nobody on earth (including Daylight) can recover your entries.
              </div>
            </div>

            <button
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2"
            >
              <span>I Understand, Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Choose Passphrase */}
        {step === 2 && (
          <form onSubmit={handleGenerateKeys} className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">
                  Set Your Journal Passphrase
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-muted">
                  Separate from your magic-link login. Never sent to the server.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-primary dark:text-dark-text mb-1">
                  Passphrase (minimum 8 characters)
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter a memorable, strong passphrase"
                    autoFocus
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
                  >
                    {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary dark:text-dark-text mb-1">
                  Confirm Passphrase
                </label>
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="Re-enter passphrase"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2.5 px-4 rounded-xl border border-border-default dark:border-dark-border text-sm font-medium text-text-muted hover:text-text-primary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !passphrase || !confirmPassphrase}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deriving Keys (600,000 rounds)...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Recovery Key</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Download Recovery File & Wallet-Style Confirmation */}
        {step === 3 && (
          <form onSubmit={handleVerifyAndFinish} className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">
                  Save Your Recovery Key
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-muted">
                  Keep this file safe in case you forget your passphrase
                </p>
              </div>
            </div>

            {/* Display Recovery Key */}
            <div className="p-3.5 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border text-center">
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-1">
                Your Unique Recovery Key
              </p>
              <p className="font-mono text-base font-bold text-amber-500 select-all tracking-wider">
                {recoveryKey}
              </p>
            </div>

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownloadRecoveryFile}
              className={`w-full py-2.5 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center space-x-2 border ${
                downloaded
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-surface-hover dark:bg-dark-surface border-border-default hover:border-amber-500 text-text-primary dark:text-dark-text'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>{downloaded ? '✓ Recovery File Downloaded' : 'Download daylight-recovery-key.json'}</span>
            </button>

            {/* Wallet-Style Verification Challenge */}
            <div className="p-3 rounded-xl bg-surface-hover dark:bg-dark-surface border border-border-default dark:border-dark-border space-y-2">
              <p className="text-xs font-semibold text-text-primary dark:text-dark-text">
                Verify you have saved it: Enter segments #1 and #3:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-text-muted mb-0.5">Segment #1 (4 letters)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={challengeSeg1}
                    onChange={(e) => setChallengeSeg1(e.target.value.toUpperCase())}
                    placeholder="e.g. XKPQ"
                    className="w-full px-3 py-1.5 rounded-lg bg-card-bg dark:bg-dark-card border border-border-default font-mono text-xs text-center uppercase text-text-primary dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-text-muted mb-0.5">Segment #3 (4 letters)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={challengeSeg3}
                    onChange={(e) => setChallengeSeg3(e.target.value.toUpperCase())}
                    placeholder="e.g. 4B2M"
                    className="w-full px-3 py-1.5 rounded-lg bg-card-bg dark:bg-dark-card border border-border-default font-mono text-xs text-center uppercase text-text-primary dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!downloaded || challengeSeg1.length !== 4 || challengeSeg3.length !== 4}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span>Verify & Activate Private Mode</span>
              <CheckCircle2 className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Step 4: Success Animation */}
        {step === 4 && (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center animate-bounce">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-text-primary dark:text-dark-text">
              Private Mode Active!
            </h3>
            <p className="text-xs text-text-muted dark:text-dark-muted max-w-xs mx-auto">
              Your journal is now protected with client-side zero-knowledge encryption. Reflections are encrypted automatically as you save.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
