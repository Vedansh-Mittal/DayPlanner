import React, { useState } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { useAuthStore } from '../stores/auth-store';
import { EncryptionSetupModal } from '../components/EncryptionSetupModal';
import {
  Shield, Key, Check, AlertCircle, Loader2,
  Sparkles, HelpCircle, Eye, EyeOff
} from 'lucide-react';

export const SecurityPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const {
    isEncryptionConfigured,
    isUnlocked,
    changePassphrase,
    setShowUnlockModal,
  } = useCrypto();

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10 fade-in select-none">
      {/* Page Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-7 h-7 text-amber-500" />
          <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text tracking-tight">
            Security & Privacy
          </h1>
        </div>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
          Zero-Knowledge End-to-End Encryption for your personal reflections.
        </p>
      </div>

      {/* Main Status Card */}
      <section className="card space-y-4 border-2 border-amber-500/30 dark:border-amber-500/20 bg-gradient-to-br from-surface to-surface-muted dark:from-dark-surface dark:to-dark-surface-muted">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary dark:text-dark-text">
                End-to-End Encryption
              </h2>
              <p className="text-xs text-text-muted dark:text-dark-text-muted">
                Military-grade AES-GCM-256 standard
              </p>
            </div>
          </div>

          {isEncryptionConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active 🔒
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-surface-hover dark:bg-dark-surface-raised text-text-muted border border-border/60">
              Not Activated
            </span>
          )}
        </div>

        <p className="text-sm text-text-secondary dark:text-dark-text-secondary leading-relaxed">
          {isEncryptionConfigured ? (
            <>
              Your daily brain dumps, priorities, action steps, meals, medications, and night thoughts are scrambled directly in your browser before saving to Supabase.
              <br /><br />
              Even if someone has physical access to the database or cloud servers, they see only indecipherable random letters. <strong>Only your password can decrypt them.</strong>
            </>
          ) : (
            <>
              Activate zero-knowledge encryption to protect your innermost reflections with a personal password. Your data is encrypted locally on your device before it ever reaches the cloud.
            </>
          )}
        </p>

        {/* Device remember notice */}
        {isEncryptionConfigured && (
          <div className="p-3.5 rounded-xl bg-lavender-light/40 dark:bg-lavender-dark/10 border border-lavender/30 text-xs text-text-secondary dark:text-dark-text-secondary flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-lavender-dark dark:text-lavender shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-text-primary dark:text-dark-text">Saved on this device:</span> This phone/browser remembers your key so you don't have to re-enter your password every time you open the app.
              {!isUnlocked && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowUnlockModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-all shadow-xs"
                  >
                    Unlock Journal Now
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          {isEncryptionConfigured ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowChangePassModal(true);
                  setPassError(null);
                  setPassSuccess(null);
                  setNewPass('');
                  setConfirmNewPass('');
                }}
                className="btn-secondary py-2.5 px-4 flex items-center gap-2 text-xs font-bold"
              >
                <Key size={14} />
                Change Password
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className="py-3 px-5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95"
            >
              <Shield size={16} />
              Set Up Encryption Password
            </button>
          )}
        </div>
      </section>

      {/* How it works / Q&A Cards */}
      <section className="card space-y-4">
        <h3 className="section-title text-text-primary dark:text-dark-text">
          <HelpCircle size={18} className="text-lavender" />
          Frequently Asked Questions
        </h3>

        <div className="space-y-3 text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed">
          <div className="p-3.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border/40 dark:border-dark-border/40">
            <p className="font-bold text-text-primary dark:text-dark-text mb-1">
              🔑 Why do I have a Magic Link AND an Encryption Password?
            </p>
            <p>
              The <strong>Magic Link</strong> signs you into your account. The <strong>Encryption Password</strong> is never stored on the server — it lives purely in your device to decode your private thoughts.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border/40 dark:border-dark-border/40">
            <p className="font-bold text-text-primary dark:text-dark-text mb-1">
              📱 Will I have to type my password every time I open the app?
            </p>
            <p>
              <strong>No!</strong> Once you unlock on this device, the key is securely remembered in your browser storage. You will only be prompted if you log in from a brand new phone, computer, or clear your browser data.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-muted dark:bg-dark-surface-muted border border-border/40 dark:border-dark-border/40">
            <p className="font-bold text-text-primary dark:text-dark-text mb-1">
              💾 What happens if I export or delete my data?
            </p>
            <p>
              When you export or delete your account, your data is automatically decrypted on your device first, so your downloaded JSON backup is fully human-readable.
            </p>
          </div>
        </div>
      </section>

      {/* Setup Wizard Modal */}
      <EncryptionSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onSuccess={() => setShowSetupModal(false)}
      />

      {/* Change Password Modal */}
      {showChangePassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-surface dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary dark:text-dark-text">Change Password</h3>
                <p className="text-xs text-text-secondary dark:text-dark-text-secondary font-medium">Updates your encryption key password instantly</p>
              </div>
            </div>

            {passError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            {passSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (newPass.length < 8) {
                  setPassError('Password must be at least 8 characters long.');
                  return;
                }
                if (newPass !== confirmNewPass) {
                  setPassError('Passwords do not match.');
                  return;
                }
                setPassLoading(true);
                setPassError(null);
                try {
                  const ok = await changePassphrase(newPass);
                  if (ok) {
                    setPassSuccess('Password updated successfully!');
                    setTimeout(() => {
                      setShowChangePassModal(false);
                      setNewPass('');
                      setConfirmNewPass('');
                      setPassSuccess(null);
                    }, 1500);
                  } else {
                    setPassError('Failed to change password. Ensure your journal is unlocked.');
                  }
                } catch (err: any) {
                  setPassError(err?.message || 'Failed to update.');
                } finally {
                  setPassLoading(false);
                }
              }}
              className="space-y-3"
            >
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

              <div>
                <label className="block text-xs font-bold text-text-primary dark:text-dark-text mb-1.5">New Password (min 8 chars)</label>
                <div className="relative">
                  <input
                    id="security-new-password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-muted dark:bg-dark-surface-raised border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text placeholder:text-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-primary dark:text-dark-text mb-1.5">Confirm New Password</label>
                <input
                  id="security-confirm-password"
                  name="confirm-password"
                  type={showPass ? 'text' : 'password'}
                  value={confirmNewPass}
                  onChange={(e) => setConfirmNewPass(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-muted dark:bg-dark-surface-raised border border-border dark:border-dark-border text-sm text-text-primary dark:text-dark-text placeholder:text-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  className="btn-ghost flex-1 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passLoading || !newPass || !confirmNewPass}
                  className="btn-primary flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {passLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
