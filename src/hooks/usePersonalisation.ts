import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { UserPersonalisation } from '../types/database';

export const DEFAULT_PERSONALISATION: Omit<UserPersonalisation, 'user_id' | 'created_at' | 'updated_at'> = {
  life_stage: null,
  life_stages: [],
  career_field: null,
  career_fields: [],
  current_focus: null,
  current_focuses: [],
  interests: [],
  support_style: 'gentle',
  support_styles: ['gentle'],
  personalisation_enabled: true,
  trivia_enabled: true,
};

function normalizePersona(data: any): UserPersonalisation {
  const life_stages = Array.isArray(data.life_stages) && data.life_stages.length
    ? data.life_stages
    : (data.life_stage ? [data.life_stage] : []);

  const career_fields = Array.isArray(data.career_fields) && data.career_fields.length
    ? data.career_fields
    : (data.career_field ? [data.career_field] : []);

  const current_focuses = Array.isArray(data.current_focuses) && data.current_focuses.length
    ? data.current_focuses
    : (data.current_focus ? [data.current_focus] : []);

  const support_styles = Array.isArray(data.support_styles) && data.support_styles.length
    ? data.support_styles
    : (data.support_style ? [data.support_style] : ['gentle']);

  const interests = Array.isArray(data.interests) ? data.interests : [];

  return {
    user_id: data.user_id,
    life_stage: life_stages[0] || null,
    life_stages,
    career_field: career_fields[0] || null,
    career_fields,
    current_focus: current_focuses[0] || null,
    current_focuses,
    interests,
    support_style: support_styles[0] || 'gentle',
    support_styles,
    personalisation_enabled: data.personalisation_enabled !== false,
    trivia_enabled: data.trivia_enabled !== false,
    created_at: data.created_at || new Date().toISOString(),
    updated_at: data.updated_at || new Date().toISOString(),
  };
}

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
        setPersonalisation(normalizePersona(data));
      } else {
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
        const payload: any = {
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString(),
        };

        // Keep singular and plural synchronized
        if (updates.life_stages) {
          payload.life_stages = updates.life_stages;
          payload.life_stage = updates.life_stages[0] || null;
        }
        if (updates.career_fields) {
          payload.career_fields = updates.career_fields;
          payload.career_field = updates.career_fields[0] || null;
        }
        if (updates.current_focuses) {
          payload.current_focuses = updates.current_focuses;
          payload.current_focus = updates.current_focuses[0] || null;
        }
        if (updates.support_styles) {
          payload.support_styles = updates.support_styles;
          payload.support_style = updates.support_styles[0] || 'gentle';
        }

        const { data, error } = await supabase
          .from('user_personalisation')
          .upsert(payload)
          .select()
          .single();

        if (error) throw error;
        if (data) setPersonalisation(normalizePersona(data));
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
