import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { supabase } from '../lib/supabase';
import {
  setupEncryption,
  unlockWithPassphrase as cryptoUnlockPassphrase,
  unlockWithRecoveryKey as cryptoUnlockRecovery,
  changePassphrase as cryptoChangePassphrase,
  decryptEntryData,
  encryptEntryData,
  decryptPriorities,
  encryptPriorities,
  decryptActionSteps,
  encryptActionSteps,
  decryptMeals,
  encryptMeals,
  decryptMedications,
  encryptMedications,
  bufferToBase64,
  base64ToBuffer,
} from '../lib/crypto';
import type { UserSettings } from '../types/database';

const SESSION_DEK_KEY = 'daylight_dek_session';

interface CryptoContextType {
  isEncryptionConfigured: boolean;
  isUnlocked: boolean;
  dek: CryptoKey | null;
  isLoadingCrypto: boolean;
  showUnlockModal: boolean;
  setShowUnlockModal: (show: boolean) => void;
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  unlockWithRecoveryKey: (recoveryKey: string) => Promise<boolean>;
  enableEncryption: (passphrase: string) => Promise<{ recoveryKey: string }>;
  changePassphrase: (newPassphrase: string) => Promise<boolean>;
  lock: () => void;
  // Transformers
  encryptDailyEntry: <T extends Record<string, any>>(entry: T) => Promise<T>;
  decryptDailyEntry: <T extends Record<string, any>>(entry: T) => Promise<T>;
  encryptPrioritiesList: (items: any[]) => Promise<any[]>;
  decryptPrioritiesList: (items: any[]) => Promise<any[]>;
  encryptActionStepsList: (items: any[]) => Promise<any[]>;
  decryptActionStepsList: (items: any[]) => Promise<any[]>;
  encryptMealsList: (items: any[]) => Promise<any[]>;
  decryptMealsList: (items: any[]) => Promise<any[]>;
  encryptMedicationsList: (items: any[]) => Promise<any[]>;
  decryptMedicationsList: (items: any[]) => Promise<any[]>;
}

const CryptoContext = createContext<CryptoContextType | null>(null);

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = useAuthStore((s) => s.user);
  const [isEncryptionConfigured, setIsEncryptionConfigured] = useState(false);
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [isLoadingCrypto, setIsLoadingCrypto] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const settingsRef = useRef<UserSettings | null>(null);

  // Cache DEK in tab sessionStorage so refresh doesn't prompt
  const cacheDekInSession = async (key: CryptoKey) => {
    try {
      const raw = await crypto.subtle.exportKey('raw', key);
      sessionStorage.setItem(SESSION_DEK_KEY, bufferToBase64(raw));
    } catch (e) {
      console.warn('Failed to cache DEK in sessionStorage:', e);
    }
  };

  const clearSessionDek = () => {
    sessionStorage.removeItem(SESSION_DEK_KEY);
  };

  // Check user settings on login
  const checkSettings = useCallback(async () => {
    if (!user) {
      setIsEncryptionConfigured(false);
      setDek(null);
      clearSessionDek();
      setIsLoadingCrypto(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load user_settings for encryption:', error);
        setIsLoadingCrypto(false);
        return;
      }

      const settings = data as UserSettings | null;
      settingsRef.current = settings;

      if (settings?.encryption_enabled && settings.wrapped_key_passphrase && settings.encryption_salt) {
        setIsEncryptionConfigured(true);

        // Check if we already have DEK in current tab's sessionStorage
        const cachedRaw = sessionStorage.getItem(SESSION_DEK_KEY);
        if (cachedRaw) {
          try {
            const rawBytes = base64ToBuffer(cachedRaw);
            const importedDek = await crypto.subtle.importKey(
              'raw',
              rawBytes,
              { name: 'AES-GCM', length: 256 },
              true,
              ['encrypt', 'decrypt']
            );
            setDek(importedDek);
            setIsLoadingCrypto(false);
            return;
          } catch (err) {
            console.warn('Failed to restore DEK from sessionStorage:', err);
            clearSessionDek();
          }
        }

        // Encryption is enabled on account but not unlocked in this tab
        setShowUnlockModal(true);
      } else {
        setIsEncryptionConfigured(false);
        setDek(null);
        clearSessionDek();
      }
    } catch (err) {
      console.error('Error in crypto settings check:', err);
    } finally {
      setIsLoadingCrypto(false);
    }
  }, [user]);

  useEffect(() => {
    checkSettings();
  }, [checkSettings]);

  // Unlock with Passphrase
  const unlockWithPassphrase = async (passphrase: string): Promise<boolean> => {
    const s = settingsRef.current;
    if (!s || !s.encryption_salt || !s.wrapped_key_passphrase || !s.key_verifier) {
      throw new Error('Encryption settings not found for this account');
    }

    try {
      const unlockedDek = await cryptoUnlockPassphrase(
        passphrase,
        s.encryption_salt,
        s.wrapped_key_passphrase,
        s.key_verifier
      );

      setDek(unlockedDek);
      await cacheDekInSession(unlockedDek);
      setShowUnlockModal(false);
      return true;
    } catch (err) {
      console.error('Unlock with passphrase failed:', err);
      return false;
    }
  };

  // Unlock with Recovery Key
  const unlockWithRecoveryKey = async (recoveryKey: string): Promise<boolean> => {
    const s = settingsRef.current;
    if (!s || !s.encryption_salt || !s.wrapped_key_recovery || !s.key_verifier) {
      throw new Error('Encryption settings not found for this account');
    }

    try {
      const unlockedDek = await cryptoUnlockRecovery(
        recoveryKey,
        s.encryption_salt,
        s.wrapped_key_recovery,
        s.key_verifier
      );

      setDek(unlockedDek);
      await cacheDekInSession(unlockedDek);
      setShowUnlockModal(false);
      return true;
    } catch (err) {
      console.error('Unlock with recovery key failed:', err);
      return false;
    }
  };

  // Initial Setup Wizard: Enable Private Mode
  const enableEncryption = async (passphrase: string): Promise<{ recoveryKey: string }> => {
    if (!user) throw new Error('User not logged in');

    const result = await setupEncryption(passphrase);

    // Save to user_settings
    const { error } = await supabase
      .from('user_settings')
      .update({
        encryption_enabled: true,
        encryption_salt: result.salt,
        wrapped_key_passphrase: result.wrappedKeyPassphrase,
        wrapped_key_recovery: result.wrappedKeyRecovery,
        key_verifier: result.keyVerifier,
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to save encryption settings to database:', error);
      throw error;
    }

    // Update state
    setDek(result.dek);
    await cacheDekInSession(result.dek);
    setIsEncryptionConfigured(true);
    setShowUnlockModal(false);

    // Refresh cached settings
    settingsRef.current = {
      ...(settingsRef.current || ({} as any)),
      encryption_enabled: true,
      encryption_salt: result.salt,
      wrapped_key_passphrase: result.wrappedKeyPassphrase,
      wrapped_key_recovery: result.wrappedKeyRecovery,
      key_verifier: result.keyVerifier,
    };

    return { recoveryKey: result.recoveryKey };
  };

  // Change Passphrase (zero re-encryption of data rows!)
  const changePassphrase = async (newPassphrase: string): Promise<boolean> => {
    if (!user || !dek) throw new Error('Journal must be unlocked to change passphrase');
    const s = settingsRef.current;
    if (!s || !s.encryption_salt) throw new Error('Encryption salt missing');

    try {
      const newWrappedPassphrase = await cryptoChangePassphrase(newPassphrase, s.encryption_salt, dek);

      const { error } = await supabase
        .from('user_settings')
        .update({
          wrapped_key_passphrase: newWrappedPassphrase,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      if (settingsRef.current) {
        settingsRef.current.wrapped_key_passphrase = newWrappedPassphrase;
      }
      return true;
    } catch (err) {
      console.error('Failed to change passphrase:', err);
      return false;
    }
  };

  // Lock session manually
  const lock = () => {
    setDek(null);
    clearSessionDek();
    if (isEncryptionConfigured) {
      setShowUnlockModal(true);
    }
  };

  // Transformers
  const encryptDailyEntry = async <T extends Record<string, any>>(entry: T): Promise<T> => {
    if (!isEncryptionConfigured || !dek) return entry;
    return encryptEntryData(entry, dek);
  };

  const decryptDailyEntry = async <T extends Record<string, any>>(entry: T): Promise<T> => {
    return decryptEntryData(entry, dek);
  };

  const encryptPrioritiesList = async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptPriorities(items, dek);
  };

  const decryptPrioritiesList = async (items: any[]): Promise<any[]> => {
    return decryptPriorities(items, dek);
  };

  const encryptActionStepsList = async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptActionSteps(items, dek);
  };

  const decryptActionStepsList = async (items: any[]): Promise<any[]> => {
    return decryptActionSteps(items, dek);
  };

  const encryptMealsList = async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptMeals(items, dek);
  };

  const decryptMealsList = async (items: any[]): Promise<any[]> => {
    return decryptMeals(items, dek);
  };

  const encryptMedicationsList = async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptMedications(items, dek);
  };

  const decryptMedicationsList = async (items: any[]): Promise<any[]> => {
    return decryptMedications(items, dek);
  };

  const isUnlocked = !isEncryptionConfigured || dek !== null;

  return (
    <CryptoContext.Provider
      value={{
        isEncryptionConfigured,
        isUnlocked,
        dek,
        isLoadingCrypto,
        showUnlockModal,
        setShowUnlockModal,
        unlockWithPassphrase,
        unlockWithRecoveryKey,
        enableEncryption,
        changePassphrase,
        lock,
        encryptDailyEntry,
        decryptDailyEntry,
        encryptPrioritiesList,
        decryptPrioritiesList,
        encryptActionStepsList,
        decryptActionStepsList,
        encryptMealsList,
        decryptMealsList,
        encryptMedicationsList,
        decryptMedicationsList,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const ctx = useContext(CryptoContext);
  if (!ctx) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return ctx;
};
