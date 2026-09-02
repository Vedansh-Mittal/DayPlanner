import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { UserPersonalisation } from '../types/database';

export const DEFAULT_PERSONALISATION: Omit<UserPersonalisation, 'user_id' | 'created_at' | 'updated_at'> = {
  life_stage: null,
  career_field: null,
  current_focus: null,
  interests: ['technology', 'psychology', 'random_facts'],
  support_style: 'gentle',
  personalisation_enabled: true,
  trivia_enabled: true,
};

export function usePersonalisation() {
  const user = useAuthStore((s) => s.user);
  const [personalisation, setPersonalisation] = useState<UserPersonalisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPersonalisation = useCallback(async () => {
    if (!user) {
      setPersonalisation(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_personalisation')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user personalisation:', error);
      }

      if (data) {
        setPersonalisation(data as UserPersonalisation);
      } else {
        // Fallback default
        setPersonalisation({
          user_id: user.id,
          ...DEFAULT_PERSONALISATION,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('Fetch personalisation error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPersonalisation();
  }, [fetchPersonalisation]);

  const updatePersonalisation = useCallback(
    async (updates: Partial<Omit<UserPersonalisation, 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) return;

      setSaving(true);
      try {
        const payload = {
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('user_personalisation')
          .upsert(payload)
          .select()
          .single();

        if (error) throw error;
        if (data) setPersonalisation(data as UserPersonalisation);
        return data;
      } catch (err) {
        console.error('Error updating personalisation:', err);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  return {
    personalisation,
    loading,
    saving,
    updatePersonalisation,
    refetch: fetchPersonalisation,
  };
}
