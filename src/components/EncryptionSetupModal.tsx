import React, { useState } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { useAuthStore } from '../stores/auth-store';
import {
  Shield, Key, Download, CheckCircle2, AlertTriangle,
  Loader2, ArrowRight, Eye, EyeOff, X, Lock, Copy, Check,
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Recovery Key State
  const [recoveryKey, setRecoveryKey] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Verification challenge (type 2 segments, e.g. segments #1 and #3)
  const [challengeSeg1, setChallengeSeg1] = useState('');
  const [challengeSeg3, setChallengeSeg3] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyKey = () => {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSeg1Change = (val: string) => {
    const clean = val.trim().toUpperCase();
    if (error) setError(null);
    // Intelligent paste: if user pastes full key (e.g. XXXX-XXXX-XXXX-XXXX)
    if (clean.includes('-') && clean.split('-').length >= 3) {
      const parts = clean.split('-');
      setChallengeSeg1(parts[0].replace(/[^A-Z0-9]/g, '').slice(0, 4));
      setChallengeSeg3(parts[2].replace(/[^A-Z0-9]/g, '').slice(0, 4));
      return;
    }
    setChallengeSeg1(clean.replace(/[^A-Z0-9]/g, '').slice(0, 4));
  };

  const handleSeg3Change = (val: string) => {
    const clean = val.trim().toUpperCase();
    if (error) setError(null);
    // Intelligent paste: if user pastes full key (e.g. XXXX-XXXX-XXXX-XXXX)
    if (clean.includes('-') && clean.split('-').length >= 3) {
      const parts = clean.split('-');
      setChallengeSeg1(parts[0].replace(/[^A-Z0-9]/g, '').slice(0, 4));
      setChallengeSeg3(parts[2].replace(/[^A-Z0-9]/g, '').slice(0, 4));
      return;
    }
    setChallengeSeg3(clean.replace(/[^A-Z0-9]/g, '').slice(0, 4));
  };

  // Step 2 -> 3: Generate and download
  const handleGenerateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await enableEncryption(password);
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

  const segments = recoveryKey ? recoveryKey.split('-') : ['', '', '', ''];
  const expectedSeg1 = segments[0] || '';
  const expectedSeg3 = segments[2] || '';

  const handleVerifyAndFinish = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      challengeSeg1.trim().toUpperCase() !== expectedSeg1.toUpperCase() ||
      challengeSeg3.trim().toUpperCase() !== expectedSeg3.toUpperCase()
    ) {
      setError('The segments you entered do not match your recovery key. Please check your downloaded file or the highlighted boxes above.');
      return;
    }

    setStep(4);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-surface dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        {step !== 4 && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-cream-dark dark:hover:bg-dark-surface"
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
                  : 'bg-border dark:bg-dark-border'
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
                  Set Up Journal Encryption
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-muted">
                  Zero-knowledge encryption for your private reflections
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border/60 dark:border-dark-border/60 text-xs space-y-2.5 text-text-muted dark:text-dark-muted">
              <p>
                <strong className="text-text-primary dark:text-dark-text">What gets encrypted:</strong> Your daily thoughts, brain dumps, priorities, action steps, meals, medications, and night notes. They are encrypted directly in your browser before ever reaching the cloud database.
              </p>
              <p>
                <strong className="text-text-primary dark:text-dark-text">Remembered on this device:</strong> Once set up, this device stays unlocked so you never have to type your password every day.
              </p>
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ <strong>Important:</strong> Because this is zero-knowledge encryption, Daylight servers never store your password. Keep your password and recovery file safe.
              </div>
            </div>

            <button
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 shadow-sm"
            >
              <span>I Understand, Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Choose Password */}
        {step === 2 && (
          <form onSubmit={handleGenerateKeys} className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">
                  Create Your Encryption Password
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-muted">
                  Used exclusively to decrypt your thoughts on your devices
                </p>
              </div>
            </div>

            <input
              type="text"
              name="username"
              id="setup-username"
              value={user?.email || ''}
              autoComplete="username"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only pointer-events-none"
            />

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-primary dark:text-dark-text mb-1">
                  Password (minimum 8 characters)
                </label>
                <div className="relative">
                  <input
                    id="setup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your encryption password"
                    autoComplete="new-password"
                    autoFocus
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary dark:text-dark-text mb-1">
                  Confirm Password
                </label>
                <input
                  id="setup-confirm-password"
                  name="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2.5 px-4 rounded-xl border border-border dark:border-dark-border text-sm font-medium text-text-muted hover:text-text-primary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Securing Key...</span>
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

        {/* Step 3: Download Recovery File & Confirmation */}
        {step === 3 && (
          <form onSubmit={handleVerifyAndFinish} className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">
                  Save Your Recovery Key
                </h3>
                <p className="text-xs text-text-muted dark:text-dark-muted">
                  Keep this safe — it unlocks your encrypted journal if you forget your password
                </p>
              </div>
            </div>

            {/* Display Recovery Key with Visual Segments */}
            <div className="p-3.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
                  Your 4 Key Segments:
                </span>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="text-xs text-lavender hover:text-lavender-dark dark:hover:text-lavender-light flex items-center gap-1 font-semibold"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500">Copied Full Key</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Full Key</span>
                    </>
                  )}
                </button>
              </div>

              {/* 4-Card Segment Visual Layout */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {segments.map((seg, idx) => {
                  const isTarget = idx === 0 || idx === 2;
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        isTarget
                          ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/60 ring-1 ring-amber-500/30 shadow-sm'
                          : 'bg-surface dark:bg-dark-surface border-border/80 dark:border-dark-border/80 opacity-70'
                      }`}
                    >
                      <div className="text-[10px] font-extrabold tracking-wider uppercase mb-1 text-text-muted dark:text-dark-text-muted">
                        Segment #{idx + 1}
                      </div>
                      <div className="font-mono text-sm sm:text-base font-extrabold tracking-widest text-text-primary dark:text-dark-text">
                        {seg || '••••'}
                      </div>
                      {isTarget ? (
                        <span className="inline-block mt-1 text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                          Enter below ↓
                        </span>
                      ) : (
                        <span className="inline-block mt-1 text-[9px] text-text-muted dark:text-dark-muted">
                          Backup only
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 1: Download Recovery File Notice & Button */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-left space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Step 1: Download your backup file (Required)
                  </p>
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed mt-0.5">
                    <strong>Why is this file essential?</strong> Daylight uses zero-knowledge encryption. If you ever lose or forget your password, nobody (not even Daylight support) can reset it. This downloaded file is your <strong>only emergency key</strong> to recover your private journal entries.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadRecoveryFile}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 border shadow-sm ${
                  downloaded
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 animate-pulse hover:animate-none'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>{downloaded ? '✓ Recovery File Downloaded & Saved' : 'Download Recovery Backup File (.json)'}</span>
              </button>
            </div>

            {/* Step 2: Verification Challenge */}
            <div className="p-3.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border dark:border-dark-border space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <p className="text-xs font-bold text-text-primary dark:text-dark-text">
                  Step 2: Enter Segment #1 and #3 to confirm
                </p>
                <span className="text-[10px] text-text-muted dark:text-dark-muted">
                  Tip: A "segment" is a 4-letter block
                </span>
              </div>

              <p className="text-[11px] text-text-secondary dark:text-dark-text-secondary leading-relaxed">
                A <strong>segment</strong> is each 4-letter block in your key separated by dashes (-). Please type the 4 letters from <strong>Segment #1</strong> (1st box above) and <strong>Segment #3</strong> (3rd box above):
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <span>Segment #1</span>
                    <span className="text-[10px] font-normal text-text-muted">(1st box)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={challengeSeg1}
                    onChange={(e) => handleSeg1Change(e.target.value)}
                    placeholder={expectedSeg1 ? `e.g. ${expectedSeg1}` : '4 letters'}
                    className="w-full px-3 py-2 rounded-lg bg-surface dark:bg-dark-surface-raised border border-amber-500/50 font-mono text-sm text-center font-bold uppercase text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <span>Segment #3</span>
                    <span className="text-[10px] font-normal text-text-muted">(3rd box)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={challengeSeg3}
                    onChange={(e) => handleSeg3Change(e.target.value)}
                    placeholder={expectedSeg3 ? `e.g. ${expectedSeg3}` : '4 letters'}
                    className="w-full px-3 py-2 rounded-lg bg-surface dark:bg-dark-surface-raised border border-amber-500/50 font-mono text-sm text-center font-bold uppercase text-text-primary dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Submit Action & Helpful Prompt */}
            <div className="space-y-1.5 pt-1">
              <button
                type="submit"
                disabled={!downloaded || challengeSeg1.length !== 4 || challengeSeg3.length !== 4}
                className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 shadow-sm"
              >
                <span>Verify & Activate Encryption</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>

              {!downloaded ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center font-medium">
                  ⬇️ Tap "Download Recovery Backup File" above to enable activation
                </p>
              ) : challengeSeg1.length !== 4 || challengeSeg3.length !== 4 ? (
                <p className="text-[11px] text-text-muted dark:text-dark-muted text-center font-medium">
                  Enter all 4 letters for Segment #1 and Segment #3 to finish
                </p>
              ) : null}
            </div>
          </form>
        )}

        {/* Step 4: Success Animation */}
        {step === 4 && (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center animate-bounce">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-text-primary dark:text-dark-text">
              Encryption Activated!
            </h3>
            <p className="text-xs text-text-muted dark:text-dark-muted max-w-xs mx-auto">
              Your journal is now protected with client-side zero-knowledge encryption. Your entries will be encrypted as you write them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
