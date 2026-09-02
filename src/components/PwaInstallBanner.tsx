import React, { useState } from 'react';
import { Smartphone, Download, Share, PlusSquare, X, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

export const PwaInstallBanner: React.FC = () => {
  const { isStandalone, isIOS, isAndroid, canInstallPrompt, isDismissed, install, dismiss } = usePwaInstall();
  const [showIosDetails, setShowIosDetails] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already running as an installed PWA, do not render banner
  if (isStandalone || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    setIsInstalling(true);
    await install();
    setIsInstalling(false);
  };

  return (
    <div className="mb-6 mx-auto w-full max-w-2xl fade-in select-none">
      <div className="relative overflow-hidden rounded-2xl border border-lavender/40 dark:border-lavender/20 bg-gradient-to-r from-lavender-light/60 via-surface/90 to-pink-soft/20 dark:from-dark-surface dark:via-dark-surface dark:to-dark-surface/90 backdrop-blur-md p-4 sm:p-5 shadow-sm">
        {/* Dismiss button */}
        <button
          onClick={() => dismiss(7)}
          className="absolute top-3 right-3 p-1.5 rounded-full text-text-muted hover:text-text-primary dark:text-dark-text-muted dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          title="Dismiss for 7 days"
          aria-label="Dismiss banner"
        >
          <X size={16} />
        </button>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 pr-6">
          {/* App Icon */}
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md ring-2 ring-lavender/30 shrink-0 bg-white dark:bg-dark-surface flex items-center justify-center">
            <img src="/mewwmory-icon.png" alt="Daylight" className="w-full h-full object-cover" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary dark:text-dark-text tracking-tight">
                {isIOS ? 'Install Daylight on your iPhone' : 'Install Daylight as an App'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-lavender/20 text-lavender-dark dark:text-lavender">
                PWA
              </span>
            </div>
            <p className="text-xs text-text-secondary dark:text-dark-text-secondary mt-0.5">
              {isIOS
                ? 'Add to Home Screen for full-screen mode & lock-screen reminders.'
                : 'Install on your home screen or desktop for fast offline access & reminders.'}
            </p>
          </div>

          {/* Action Button */}
          <div className="w-full sm:w-auto mt-2 sm:mt-0 flex items-center gap-2">
            {isIOS ? (
              <button
                onClick={() => setShowIosDetails(!showIosDetails)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-lavender-dark dark:bg-lavender text-white dark:text-dark-bg text-xs font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5"
              >
                <span>How to Install</span>
                <ChevronRight size={14} className={`transition-transform duration-200 ${showIosDetails ? 'rotate-90' : ''}`} />
              </button>
            ) : canInstallPrompt ? (
              <button
                onClick={handleInstallClick}
                disabled={isInstalling}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-lavender-dark dark:bg-lavender text-white dark:text-dark-bg text-xs font-bold shadow-sm hover:shadow active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Download size={14} />
                <span>{isInstalling ? 'Installing…' : 'Install App'}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowIosDetails(!showIosDetails)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-surface dark:bg-dark-surface border border-border/80 dark:border-dark-border/80 text-text-primary dark:text-dark-text text-xs font-semibold hover:bg-border/30 transition-all flex items-center justify-center gap-1.5"
              >
                <HelpCircle size={14} className="text-lavender" />
                <span>Instructions</span>
              </button>
            )}
          </div>
        </div>

        {/* Step-by-Step Instructions Dropdown / Card */}
        {showIosDetails && (
          <div className="mt-4 pt-4 border-t border-border/40 dark:border-dark-border/40 text-xs text-text-secondary dark:text-dark-text-secondary">
            {isIOS ? (
              <div className="space-y-2.5">
                <p className="font-semibold text-text-primary dark:text-dark-text">
                  To install in 2 quick steps on Safari (iPhone/iPad):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/70 dark:bg-black/20 border border-border/40 dark:border-dark-border/40">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-lavender/30 text-lavender-dark dark:text-lavender font-bold text-[11px] shrink-0">
                      1
                    </span>
                    <div>
                      <p className="font-medium text-text-primary dark:text-dark-text flex items-center gap-1">
                        Tap Safari Share <Share size={13} className="text-blue-500" />
                      </p>
                      <p className="text-[11px] text-text-muted dark:text-dark-text-muted mt-0.5">
                        Tap the Share icon at the bottom of Safari.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/70 dark:bg-black/20 border border-border/40 dark:border-dark-border/40">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-lavender/30 text-lavender-dark dark:text-lavender font-bold text-[11px] shrink-0">
                      2
                    </span>
                    <div>
                      <p className="font-medium text-text-primary dark:text-dark-text flex items-center gap-1">
                        Select "Add to Home Screen" <PlusSquare size={13} className="text-emerald-500" />
                      </p>
                      <p className="text-[11px] text-text-muted dark:text-dark-text-muted mt-0.5">
                        Scroll down and tap <strong>Add</strong> in the top-right corner.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-text-muted dark:text-dark-text-muted italic">
                    Note: Push notifications on iOS require adding to Home Screen first.
                  </p>
                  <button
                    onClick={() => dismiss(30)}
                    className="text-[11px] font-semibold text-lavender-dark dark:text-lavender hover:underline"
                  >
                    Don't show again
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-semibold text-text-primary dark:text-dark-text">
                  To install on Android or Desktop:
                </p>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/20 border border-border/40 dark:border-dark-border/40">
                  <p className="text-[11px]">
                    Tap your browser menu (<strong>⋮</strong> or <strong>⋯</strong>) at the top/bottom and select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                  </p>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => dismiss(30)}
                    className="text-[11px] font-semibold text-lavender-dark dark:text-lavender hover:underline"
                  >
                    Don't show again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
