import React from 'react';
import type { SaveStatus } from '../hooks/useDailyEntry';
import { Loader2, Check, AlertCircle } from 'lucide-react';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error: string | null;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ status, error }) => {
  if (status === 'idle') return null;

  return (
    <div className={`save-indicator ${status}`}>
      {status === 'saving' && (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={14} />
          <span>Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={14} />
          <span>{error || 'Save failed'}</span>
        </>
      )}
    </div>
  );
};
