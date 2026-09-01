import React, { useState, useEffect } from 'react';
import { Sparkles, Heart } from 'lucide-react';

const REFLECTION_QUOTES = [
  "Gathering your daily thoughts with care… 🌸",
  "Connecting the dots between how you felt & what you achieved… ✨",
  "Listening closely to your journal entries… ☕",
  "Preparing a warm, gentle takeaway for you… ❤️",
];

export const AIThinkingCompanion: React.FC = () => {
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % REFLECTION_QUOTES.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center select-none fade-in">
      {/* Animated AI Companion Orb Mascot */}
      <div className="relative mb-6">
        {/* Pulsing outer aura */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-soft via-lavender to-blue-soft blur-md animate-ping opacity-30" />

        {/* Breathing Companion Body */}
        <div className="absolute inset-0 w-20 h-20 rounded-full bg-gradient-to-tr from-lavender via-pink-soft to-blue-soft flex items-center justify-center shadow-lg border-2 border-white/60 dark:border-dark-border animate-pulse">
          <div className="flex items-center gap-1.5">
            <Sparkles size={20} className="text-white animate-bounce" />
            <Heart size={18} className="text-white fill-white/80 animate-pulse" />
          </div>
        </div>

        {/* Floating sparkles */}
        <div className="absolute -top-2 -right-2 text-yellow-400 text-sm animate-bounce" style={{ animationDelay: '0.2s' }}>
          ✨
        </div>
        <div className="absolute -bottom-1 -left-2 text-pink-400 text-xs animate-bounce" style={{ animationDelay: '0.5s' }}>
          🌸
        </div>
      </div>

      {/* Companion Status Message */}
      <h3 className="text-base font-extrabold text-text-primary dark:text-dark-text tracking-tight mb-1">
        Mewwmory Companion is Reflecting
      </h3>
      <p className="text-xs font-semibold text-lavender-dark dark:text-lavender transition-all duration-500 h-5 italic">
        "{REFLECTION_QUOTES[quoteIdx]}"
      </p>
    </div>
  );
};
