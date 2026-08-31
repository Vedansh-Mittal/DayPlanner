import React from 'react';
import { Check } from 'lucide-react';

interface HabitRingTargetProps {
  label: string;
  emoji: string;
  completed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const HabitRingTarget: React.FC<HabitRingTargetProps> = ({
  label,
  emoji,
  completed,
  onToggle,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      className={`habit-ring-card tap-spring ${completed ? 'completed' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
      onClick={() => !disabled && onToggle()}
      aria-pressed={completed}
      disabled={disabled}
    >
      {/* Icon with circular ring border */}
      <div className="relative">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${
            completed
              ? 'bg-mint text-emerald-950 scale-105 shadow-sm'
              : 'bg-cream-dark dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary border border-border dark:border-dark-border'
          }`}
        >
          {emoji}
        </div>

        {/* Small check badge when completed */}
        {completed && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Check size={10} strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Label */}
      <span className="text-xs font-bold tracking-tight text-center leading-tight">
        {label}
      </span>
    </button>
  );
};
