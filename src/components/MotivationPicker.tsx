import React from 'react';
import { Sparkles } from 'lucide-react';

export const MOTIVATION_CHIP_DATA = [
  { value: 'Growth', label: 'Growth', emoji: '🌱' },
  { value: 'Future goals', label: 'Future goals', emoji: '🚀' },
  { value: 'Freedom', label: 'Freedom', emoji: '🕊️' },
  { value: 'Helping others', label: 'Helping others', emoji: '🤝' },
  { value: 'Becoming my best self', label: 'Best self', emoji: '⭐' },
  { value: 'Other', label: 'Other', emoji: '✏️' },
];

interface MotivationPickerProps {
  selectedMotivations: string[];
  otherText: string;
  onToggle: (m: string) => void;
  onOtherChange: (text: string) => void;
  onBlur: () => void;
  disabled?: boolean;
}

export const MotivationPicker: React.FC<MotivationPickerProps> = ({
  selectedMotivations,
  otherText,
  onToggle,
  onOtherChange,
  onBlur,
  disabled = false,
}) => {
  const isOtherSelected = selectedMotivations.includes('Other');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {MOTIVATION_CHIP_DATA.map((item) => {
          const isSelected = selectedMotivations.includes(item.value);
          return (
            <button
              key={item.value}
              type="button"
              className={`motivation-chip ${isSelected ? 'selected' : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={() => !disabled && onToggle(item.value)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              <span className="text-base">{item.emoji}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Input for 'Other' option */}
      {isOtherSelected && (
        <div className="pt-1 fade-in">
          <input
            type="text"
            className="input-field text-sm"
            placeholder="What else inspires you today?"
            value={otherText}
            onChange={(e) => onOtherChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            autoFocus
          />
        </div>
      )}
    </div>
  );
};
