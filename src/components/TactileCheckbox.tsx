import React from 'react';
import { Check } from 'lucide-react';

interface TactileCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const TactileCheckbox: React.FC<TactileCheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  ariaLabel = 'Checkbox',
}) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`checkbox-tactile-btn ${checked ? 'checked' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {checked && (
        <Check
          size={13}
          strokeWidth={3.5}
          className="text-white animate-in zoom-in-50 duration-150"
        />
      )}
    </button>
  );
};
