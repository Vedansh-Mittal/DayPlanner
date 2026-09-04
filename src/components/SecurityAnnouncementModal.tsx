import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sparkles, X, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SecurityAnnouncementModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if the user has already seen this announcement once
    const hasSeenNotice = localStorage.getItem('mewwmory_security_notice_v1_shown');
    if (!hasSeenNotice) {
      // Delay slightly for smooth page entry
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = (goToSecurity = false) => {
    localStorage.setItem('mewwmory_security_notice_v1_shown', 'true');
    setIsOpen(false);
    if (goToSecurity) {
      navigate('/app/security');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md fade-in select-none">
      <div className="max-w-md w-full rounded-[28px] border border-amber-500/30 bg-surface dark:bg-dark-surface p-6 shadow-2xl space-y-5 relative">
        <button
          onClick={() => handleDismiss(false)}
          className="absolute top-4 right-4 p-1.5 rounded-full text-text-muted hover:text-text-primary dark:hover:text-dark-text bg-surface-hover dark:bg-dark-surface-raised transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              New Security Upgrade ✨
            </span>
            <h3 className="text-lg font-extrabold text-text-primary dark:text-dark-text mt-0.5">
              Enhanced Journal Privacy
            </h3>
          </div>
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-text-secondary dark:text-dark-text-secondary">
          <p>
            We've upgraded Mewwmory with optional <strong className="text-text-primary dark:text-dark-text">Zero-Knowledge End-to-End Encryption (E2EE)</strong>.
          </p>
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1.5 text-text-primary dark:text-dark-text">
            <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
              <Lock size={14} />
              <span>What this means for you:</span>
            </div>
            <p className="text-[11px] text-text-secondary dark:text-dark-text-secondary">
              Your data has always been private. Now, you can scramble your journal entries directly on your device before saving, making your reflections even safer.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            onClick={() => handleDismiss(true)}
            className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
          >
            <Sparkles size={14} />
            <span>Explore Security Settings</span>
          </button>
          <button
            onClick={() => handleDismiss(false)}
            className="py-2.5 px-4 rounded-xl btn-secondary text-xs font-semibold"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
