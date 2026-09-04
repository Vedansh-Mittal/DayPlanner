/**
 * Daylight Planner — Zero-Knowledge Client-Side Envelope Encryption (E2EE)
 * 
 * Cryptographic Architecture:
 * 1. Data Encryption Key (DEK): 256-bit AES-GCM key, generated client-side, never transmitted to server.
 * 2. Key Encryption Key (KEK_passphrase): Derived via PBKDF2-HMAC-SHA256 (600,000 iterations) from user passphrase + 16-byte salt.
 * 3. Key Encryption Key (KEK_recovery): Derived via PBKDF2 from high-entropy recovery token.
 * 4. Key Wrapping: DEK is exported as raw bytes and encrypted with KEK using AES-GCM-256.
 * 5. Format Guard: Ciphertexts are prefixed with "enc:v1:<iv_b64>:<ciphertext_b64>".
 *    Any field without "enc:v1:" is treated as legacy unencrypted plaintext (100% backward compatible).
 */

const ENVELOPE_PREFIX = 'enc:v1:';
const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = 'daylight-verify-v1';

/* ===== Base64 / ArrayBuffer Encoding Helpers ===== */

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/* ===== Random Generation Helpers ===== */

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufferToBase64(salt);
}

/**
 * Generates a high-entropy, human-readable recovery key (e.g. "XKPQ-7HNT-4B2M-9W8Y")
 */
export function generateRecoveryKey(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Crockford Base32-like (unambiguous)
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += alphabet[bytes[i] % alphabet.length];
  }
  // Format as 4 groups of 4: XXXX-XXXX-XXXX-XXXX
  return `${str.slice(0, 4)}-${str.slice(4, 8)}-${str.slice(8, 12)}-${str.slice(12, 16)}`;
}

/* ===== Key Derivation (PBKDF2-HMAC-SHA256, 600k iterations) ===== */

async function deriveKekFromSecret(secret: string, saltBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = base64ToBuffer(saltBase64);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* ===== Master Data Encryption Key (DEK) Lifecycle ===== */

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so it can be wrapped
    ['encrypt', 'decrypt']
  );
}

/**
 * Wraps (encrypts) the Master DEK using a KEK.
 * Result format: "<iv_base64>:<wrapped_key_base64>"
 */
export async function wrapKey(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const rawDek = await crypto.subtle.exportKey('raw', dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    rawDek
  );

  return `${bufferToBase64(iv)}:${bufferToBase64(wrapped)}`;
}

/**
 * Unwraps (decrypts) the Master DEK using a KEK.
 */
export async function unwrapKey(wrappedBlob: string, kek: CryptoKey): Promise<CryptoKey> {
  const parts = wrappedBlob.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid wrapped key format');
  }

  const iv = base64ToBuffer(parts[0]);
  const ciphertext = base64ToBuffer(parts[1]);

  const rawDek = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kek,
    ciphertext
  );

  return crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/* ===== Verifier Creation & Checking ===== */

export async function createVerifier(dek: CryptoKey): Promise<string> {
  return encryptField(VERIFIER_PLAINTEXT, dek) as Promise<string>;
}

export async function testVerifier(verifierBlob: string, dek: CryptoKey): Promise<boolean> {
  try {
    const decrypted = await decryptField(verifierBlob, dek);
    return decrypted === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/* ===== High-Level Setup & Unlock Operations ===== */

export interface SetupEncryptionResult {
  salt: string;
  wrappedKeyPassphrase: string;
  wrappedKeyRecovery: string;
  keyVerifier: string;
  recoveryKey: string;
  dek: CryptoKey;
}

/**
 * Generates everything needed for initial setup wizard
 */
export async function setupEncryption(passphrase: string): Promise<SetupEncryptionResult> {
  const salt = generateSalt();
  const recoveryKey = generateRecoveryKey();

  // Generate Master Key (DEK)
  const dek = await generateMasterKey();

  // Derive Passphrase KEK & wrap DEK
  const kekPassphrase = await deriveKekFromSecret(passphrase, salt);
  const wrappedKeyPassphrase = await wrapKey(dek, kekPassphrase);

  // Derive Recovery KEK & wrap DEK
  const kekRecovery = await deriveKekFromSecret(recoveryKey, salt);
  const wrappedKeyRecovery = await wrapKey(dek, kekRecovery);

  // Create verifier
  const keyVerifier = await createVerifier(dek);

  return {
    salt,
    wrappedKeyPassphrase,
    wrappedKeyRecovery,
    keyVerifier,
    recoveryKey,
    dek,
  };
}

/**
 * Attempts to unlock the journal using the user's passphrase
 */
export async function unlockWithPassphrase(
  passphrase: string,
  salt: string,
  wrappedKeyPassphrase: string,
  keyVerifier: string
): Promise<CryptoKey> {
  const kek = await deriveKekFromSecret(passphrase, salt);
  const dek = await unwrapKey(wrappedKeyPassphrase, kek);

  const isValid = await testVerifier(keyVerifier, dek);
  if (!isValid) {
    throw new Error('Incorrect passphrase');
  }

  return dek;
}

/**
 * Attempts to unlock the journal using the recovery key
 */
export async function unlockWithRecoveryKey(
  recoveryKeyInput: string,
  salt: string,
  wrappedKeyRecovery: string,
  keyVerifier: string
): Promise<CryptoKey> {
  const cleanKey = recoveryKeyInput.trim().toUpperCase().replace(/\s+/g, '');
  const kek = await deriveKekFromSecret(cleanKey, salt);
  const dek = await unwrapKey(wrappedKeyRecovery, kek);

  const isValid = await testVerifier(keyVerifier, dek);
  if (!isValid) {
    throw new Error('Invalid recovery key');
  }

  return dek;
}

/**
 * Changes the user's passphrase without re-encrypting any journal data!
 * Simply re-wraps the existing DEK under the new passphrase.
 */
export async function changePassphrase(
  newPassphrase: string,
  salt: string,
  dek: CryptoKey
): Promise<string> {
  const kekPassphrase = await deriveKekFromSecret(newPassphrase, salt);
  return wrapKey(dek, kekPassphrase);
}

/* ===== Field-Level Encryption & Decryption ===== */

/**
 * Encrypts a text string using AES-GCM-256.
 * Returns formatted envelope: "enc:v1:<iv_base64>:<ciphertext_base64>"
 */
export async function encryptField(
  plaintext: string | null | undefined,
  dek: CryptoKey
): Promise<string | null> {
  if (plaintext === null || plaintext === undefined) return null;
  if (typeof plaintext !== 'string') return plaintext;
  if (plaintext.trim() === '') return '';

  // Already encrypted? Avoid double encryption
  if (plaintext.startsWith(ENVELOPE_PREFIX)) {
    return plaintext;
  }

  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dek,
    enc.encode(plaintext)
  );

  return `${ENVELOPE_PREFIX}${bufferToBase64(iv)}:${bufferToBase64(ciphertext)}`;
}

/**
 * Decrypts an encrypted field string.
 * If the string does not start with "enc:v1:", it is legacy plaintext and returned as-is!
 */
export async function decryptField(
  ciphertext: string | null | undefined,
  dek: CryptoKey | null
): Promise<string | null> {
  if (ciphertext === null || ciphertext === undefined) return null;
  if (typeof ciphertext !== 'string') return ciphertext;

  // Format Guard: Not encrypted? Return plain string directly!
  if (!ciphertext.startsWith(ENVELOPE_PREFIX)) {
    return ciphertext;
  }

  // If encrypted but no key provided, return placeholder
  if (!dek) {
    return '[Locked Entry — Unlock to view]';
  }

  try {
    const rawPayload = ciphertext.slice(ENVELOPE_PREFIX.length);
    const parts = rawPayload.split(':');
    if (parts.length !== 2) return ciphertext;

    const iv = base64ToBuffer(parts[0]);
    const encryptedData = base64ToBuffer(parts[1]);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      dek,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn('Decryption failed for field:', err);
    return '[Decryption Error]';
  }
}

/* ===== Daily Entry & Child Table Batch Transformers ===== */

const ENCRYPTED_ENTRY_FIELDS: (keyof any)[] = [
  'morning_brain_dump',
  'morning_why',
  'morning_inspire',
  'morning_motivation_other',
  'night_gratitude_1',
  'night_gratitude_2',
  'night_gratitude_3',
  'night_win',
  'night_went_well',
  'night_improve',
  'night_brain_dump',
  'night_intention',
  'medication_notes',
  'daily_note',
];

export async function encryptEntryData<T extends Record<string, any>>(
  entry: T,
  dek: CryptoKey
): Promise<T> {
  const copy = { ...entry } as any;

  for (const field of ENCRYPTED_ENTRY_FIELDS) {
    if (copy[field] !== undefined) {
      copy[field] = await encryptField(copy[field], dek);
    }
  }

  return copy;
}

export async function decryptEntryData<T extends Record<string, any>>(
  entry: T,
  dek: CryptoKey | null
): Promise<T> {
  const copy = { ...entry } as any;

  for (const field of ENCRYPTED_ENTRY_FIELDS) {
    if (copy[field] !== undefined) {
      copy[field] = await decryptField(copy[field], dek);
    }
  }

  return copy;
}

export async function encryptPriorities(priorities: any[], dek: CryptoKey): Promise<any[]> {
  return Promise.all(
    priorities.map(async (p) => ({
      ...p,
      text: await encryptField(p.text, dek),
    }))
  );
}

export async function decryptPriorities(priorities: any[], dek: CryptoKey | null): Promise<any[]> {
  return Promise.all(
    priorities.map(async (p) => ({
      ...p,
      text: await decryptField(p.text, dek),
    }))
  );
}

export async function encryptActionSteps(actionSteps: any[], dek: CryptoKey): Promise<any[]> {
  return Promise.all(
    actionSteps.map(async (a) => ({
      ...a,
      text: await encryptField(a.text, dek),
    }))
  );
}

export async function decryptActionSteps(actionSteps: any[], dek: CryptoKey | null): Promise<any[]> {
  return Promise.all(
    actionSteps.map(async (a) => ({
      ...a,
      text: await decryptField(a.text, dek),
    }))
  );
}

export async function encryptMeals(meals: any[], dek: CryptoKey): Promise<any[]> {
  return Promise.all(
    meals.map(async (m) => ({
      ...m,
      notes: await encryptField(m.notes, dek),
    }))
  );
}

export async function decryptMeals(meals: any[], dek: CryptoKey | null): Promise<any[]> {
  return Promise.all(
    meals.map(async (m) => ({
      ...m,
      notes: await decryptField(m.notes, dek),
    }))
  );
}

export async function encryptMedications(meds: any[], dek: CryptoKey): Promise<any[]> {
  return Promise.all(
    meds.map(async (m) => ({
      ...m,
      name: await encryptField(m.name, dek),
      dose: await encryptField(m.dose, dek),
    }))
  );
}

export async function decryptMedications(meds: any[], dek: CryptoKey | null): Promise<any[]> {
  return Promise.all(
    meds.map(async (m) => ({
      ...m,
      name: await decryptField(m.name, dek),
      dose: await decryptField(m.dose, dek),
    }))
  );
}
