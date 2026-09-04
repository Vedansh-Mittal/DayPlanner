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

const DEVICE_DEK_KEY = 'daylight_dek_device';
const SESSION_UNLOCKED_KEY = 'daylight_session_unlocked';

interface CryptoContextType {
  isEncryptionConfigured: boolean;
  isUnlocked: boolean;
  dek: CryptoKey | null;
  cachedPassphrase: string | null;
  isLoadingCrypto: boolean;
  showUnlockModal: boolean;
  setShowUnlockModal: (show: boolean) => void;
  unlockWithPassphrase: (password: string) => Promise<boolean>;
  unlockWithRecoveryKey: (recoveryKey: string) => Promise<boolean>;
  enableEncryption: (password: string) => Promise<{ recoveryKey: string }>;
  changePassphrase: (newPassword: string) => Promise<boolean>;
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
  const [cachedPassphrase, setCachedPassphrase] = useState<string | null>(null);
  const [isLoadingCrypto, setIsLoadingCrypto] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const settingsRef = useRef<UserSettings | null>(null);

  // Save DEK in local storage for the device/browser (persists across tab closes, browser restarts)
  const saveDekToDevice = async (key: CryptoKey, userId?: string) => {
    try {
      const raw = await crypto.subtle.exportKey('raw', key);
      const b64 = bufferToBase64(raw);
      localStorage.setItem(DEVICE_DEK_KEY, b64);
      localStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      if (userId) {
        localStorage.setItem(`${DEVICE_DEK_KEY}_${userId}`, b64);
      }
    } catch (e) {
      console.warn('Failed to save DEK in local storage:', e);
    }
  };

  const clearDeviceDek = (userId?: string) => {
    localStorage.removeItem(DEVICE_DEK_KEY);
    localStorage.removeItem(SESSION_UNLOCKED_KEY);
    sessionStorage.removeItem(DEVICE_DEK_KEY);
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    setCachedPassphrase(null);
    if (userId) {
      localStorage.removeItem(`${DEVICE_DEK_KEY}_${userId}`);
      sessionStorage.removeItem(`${DEVICE_DEK_KEY}_${userId}`);
    }
  };

  // Check user settings on login
  const checkSettings = useCallback(async () => {
    if (!user) {
      setIsEncryptionConfigured(false);
      setDek(null);
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

        // Check if this device/browser was unlocked
        const isDeviceUnlocked =
          localStorage.getItem(SESSION_UNLOCKED_KEY) === 'true' ||
          sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';

        const cachedRaw =
          localStorage.getItem(`${DEVICE_DEK_KEY}_${user.id}`) ||
          localStorage.getItem(DEVICE_DEK_KEY) ||
          sessionStorage.getItem(`${DEVICE_DEK_KEY}_${user.id}`) ||
          sessionStorage.getItem(DEVICE_DEK_KEY);

        if (isDeviceUnlocked && cachedRaw) {
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
            setShowUnlockModal(false);
            setIsLoadingCrypto(false);
            return;
          } catch (err) {
            console.warn('Failed to restore DEK from storage:', err);
            clearDeviceDek(user.id);
          }
        }

        // Fresh login or locked session: ask user to enter/autofill password to decrypt!
        setDek(null);
        setShowUnlockModal(true);
      } else {
        setIsEncryptionConfigured(false);
        setDek(null);
        clearDeviceDek(user?.id);
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
      setCachedPassphrase(passphrase);
      await saveDekToDevice(unlockedDek, user?.id);
      setShowUnlockModal(false);
      return true;
    } catch (err) {
      console.error('Unlock with password failed:', err);
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
      await saveDekToDevice(unlockedDek, user?.id);
      setShowUnlockModal(false);
      return true;
    } catch (err) {
      console.error('Unlock with recovery key failed:', err);
      return false;
    }
  };

  // Initial Setup Wizard: Enable Private Mode
  const enableEncryption = async (password: string): Promise<{ recoveryKey: string }> => {
    if (!user) throw new Error('User not logged in');

    const result = await setupEncryption(password);

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
    setCachedPassphrase(password);
    await saveDekToDevice(result.dek, user?.id);
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

  // Change Password (zero re-encryption of data rows!)
  const changePassphrase = async (newPassword: string): Promise<boolean> => {
    if (!user || !dek) throw new Error('Journal must be unlocked to change password');
    const s = settingsRef.current;
    if (!s || !s.encryption_salt) throw new Error('Encryption salt missing');

    try {
      const newWrappedPassphrase = await cryptoChangePassphrase(newPassword, s.encryption_salt, dek);

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
      setCachedPassphrase(newPassword);
      return true;
    } catch (err) {
      console.error('Failed to change password:', err);
      return false;
    }
  };

  // Lock session manually
  const lock = () => {
    setDek(null);
    clearDeviceDek(user?.id);
    if (isEncryptionConfigured) {
      setShowUnlockModal(true);
    }
  };

  // Transformers (memoized so consumers react when dek changes)
  const encryptDailyEntry = useCallback(async <T extends Record<string, any>>(entry: T): Promise<T> => {
    if (!isEncryptionConfigured || !dek) return entry;
    return encryptEntryData(entry, dek);
  }, [isEncryptionConfigured, dek]);

  const decryptDailyEntry = useCallback(async <T extends Record<string, any>>(entry: T): Promise<T> => {
    return decryptEntryData(entry, dek);
  }, [dek]);

  const encryptPrioritiesList = useCallback(async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptPriorities(items, dek);
  }, [isEncryptionConfigured, dek]);

  const decryptPrioritiesList = useCallback(async (items: any[]): Promise<any[]> => {
    return decryptPriorities(items, dek);
  }, [dek]);

  const encryptActionStepsList = useCallback(async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptActionSteps(items, dek);
  }, [isEncryptionConfigured, dek]);

  const decryptActionStepsList = useCallback(async (items: any[]): Promise<any[]> => {
    return decryptActionSteps(items, dek);
  }, [dek]);

  const encryptMealsList = useCallback(async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptMeals(items, dek);
  }, [isEncryptionConfigured, dek]);

  const decryptMealsList = useCallback(async (items: any[]): Promise<any[]> => {
    return decryptMeals(items, dek);
  }, [dek]);

  const encryptMedicationsList = useCallback(async (items: any[]): Promise<any[]> => {
    if (!isEncryptionConfigured || !dek) return items;
    return encryptMedications(items, dek);
  }, [isEncryptionConfigured, dek]);

  const decryptMedicationsList = useCallback(async (items: any[]): Promise<any[]> => {
    return decryptMedications(items, dek);
  }, [dek]);

  const isUnlocked = !isEncryptionConfigured || dek !== null;

  return (
    <CryptoContext.Provider
      value={{
        isEncryptionConfigured,
        isUnlocked,
        dek,
        cachedPassphrase,
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
