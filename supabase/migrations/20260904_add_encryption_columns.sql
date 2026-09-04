-- Migration: Add Client-Side Encryption (E2EE) Columns to user_settings
-- Safe, additive migration (non-destructive, default false for all existing users)

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS encryption_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS encryption_salt text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS wrapped_key_passphrase text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS wrapped_key_recovery text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS key_verifier text;

COMMENT ON COLUMN public.user_settings.encryption_enabled IS 'Whether the user has enabled zero-knowledge client-side encryption';
COMMENT ON COLUMN public.user_settings.encryption_salt IS '16-byte random salt in Base64 used for PBKDF2 key derivation';
COMMENT ON COLUMN public.user_settings.wrapped_key_passphrase IS 'Master Data Encryption Key (DEK) wrapped with user passphrase-derived KEK';
COMMENT ON COLUMN public.user_settings.wrapped_key_recovery IS 'Master Data Encryption Key (DEK) wrapped with high-entropy recovery key';
COMMENT ON COLUMN public.user_settings.key_verifier IS 'Ciphertext of known canary string to verify passphrase correctness client-side';
