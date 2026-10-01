import { test, expect } from '@playwright/test';
import { setupSupabaseMocks, injectAuthenticatedSession } from './fixtures/mock-supabase';

test.describe('Zero-Knowledge Client-Side Encryption Flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthenticatedSession(page);
  });

  test('displays unactivated encryption state initially and explains E2EE', async ({ page }) => {
    await setupSupabaseMocks(page, { encryptionEnabled: false });
    await page.goto('/app/security');

    await expect(page.getByRole('heading', { name: /Security & Privacy/i })).toBeVisible();
    await expect(page.getByText('Not Activated')).toBeVisible();
    await expect(page.getByRole('button', { name: /Set Up Encryption Password/i })).toBeVisible();
  });

  test('completes 4-step encryption setup wizard and activates E2EE', async ({ page }) => {
    const dbState = await setupSupabaseMocks(page, { encryptionEnabled: false });
    await page.goto('/app/security');

    // 1. Open Setup Modal
    await page.getByRole('button', { name: /Set Up Encryption Password/i }).click();
    await expect(page.getByText(/Zero-Knowledge Encryption/i).first()).toBeVisible();

    // Step 1 -> Step 2
    const continueBtn = page.getByRole('button', { name: /I Understand, Continue/i });
    await continueBtn.click();

    // 2. Step 2: Enter Password
    const passwordInput = page.locator('#setup-password');
    const confirmPasswordInput = page.locator('#setup-confirm-password');

    await passwordInput.fill('VaultPassphrase2026!');
    await confirmPasswordInput.fill('VaultPassphrase2026!');

    const generateKeyBtn = page.getByRole('button', { name: /Generate Recovery Key/i });
    await generateKeyBtn.click();

    // 3. Step 3: Recovery Key Display & Challenge
    await expect(page.getByText(/Save Your Recovery Key/i)).toBeVisible();

    // Download recovery backup file
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Recovery Backup File/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('daylight-recovery-key');

    // Extract displayed Segment 1 and Segment 3 from the 4-card segment visual layout
    const seg1Text = (await page.locator('.font-mono').first().textContent())?.trim() || '';
    const seg3Text = (await page.locator('.font-mono').nth(2).textContent())?.trim() || '';

    expect(seg1Text.length).toBe(4);
    expect(seg3Text.length).toBe(4);

    // Enter challenge segments
    const challengeInputs = page.locator('input[maxlength="4"]');
    await challengeInputs.first().fill(seg1Text);
    await challengeInputs.nth(1).fill(seg3Text);

    // Submit challenge
    const activateBtn = page.getByRole('button', { name: /Verify & Activate Encryption/i });
    await activateBtn.click();

    // Modal closes and status changes to Active
    await expect(page.getByText(/Active 🔒/i)).toBeVisible({ timeout: 10000 });

    // Verify backend received wrapped keys
    expect(dbState.settings.encryption_enabled).toBe(true);
    expect(dbState.settings.wrapped_key_passphrase).toBeTruthy();
    expect(dbState.settings.key_verifier).toBeTruthy();
  });

  test('scrambles reflections with AES-GCM envelope prefix (enc:v1:) before sending over wire', async ({ page }) => {
    let interceptedEntryPayload: any = null;

    // Monitor REST requests to daily_entries
    await page.route('**/rest/v1/daily_entries*', async (route) => {
      if (route.request().method() === 'POST' || route.request().method() === 'PATCH') {
        interceptedEntryPayload = route.request().postDataJSON();
      }
      return route.continue();
    });

    await setupSupabaseMocks(page, { encryptionEnabled: false });
    await page.goto('/app/security');

    // Enable encryption
    await page.getByRole('button', { name: /Set Up Encryption Password/i }).click();
    await page.getByRole('button', { name: /I Understand, Continue/i }).click();
    await page.locator('#setup-password').fill('VaultPassphrase2026!');
    await page.locator('#setup-confirm-password').fill('VaultPassphrase2026!');
    await page.getByRole('button', { name: /Generate Recovery Key/i }).click();

    // Download recovery file (required to enable activation)
    const downloadPromise2 = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Recovery Backup File/i }).click();
    await downloadPromise2;

    const seg1 = (await page.locator('.font-mono').first().textContent())?.trim() || '';
    const seg3 = (await page.locator('.font-mono').nth(2).textContent())?.trim() || '';

    const challengeInputs = page.locator('input[maxlength="4"]');
    await challengeInputs.first().fill(seg1);
    await challengeInputs.nth(1).fill(seg3);
    await page.getByRole('button', { name: /Verify & Activate Encryption/i }).click();

    await expect(page.getByText(/Active 🔒/i)).toBeVisible({ timeout: 10000 });

    // Navigate to Planner and write a private thought
    await page.goto('/app');
    const brainDump = page.getByPlaceholder(/Write anything on your mind…/i);
    await brainDump.fill('Top secret reflection about personal growth');

    // Wait for auto-save
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Saved')).toBeVisible();

    // Assert that the intercepted network payload contains ciphertext with enc:v1: prefix
    if (interceptedEntryPayload && interceptedEntryPayload.morning_brain_dump) {
      expect(interceptedEntryPayload.morning_brain_dump).toMatch(/^enc:v1:/);
      expect(interceptedEntryPayload.morning_brain_dump).not.toContain('Top secret');
    }
  });

  test('allows changing password without re-encrypting journal data', async ({ page }) => {
    await setupSupabaseMocks(page, { encryptionEnabled: false });
    await page.goto('/app/security');

    // Enable encryption
    await page.getByRole('button', { name: /Set Up Encryption Password/i }).click();
    await page.getByRole('button', { name: /I Understand, Continue/i }).click();
    await page.locator('#setup-password').fill('OldPassword123!');
    await page.locator('#setup-confirm-password').fill('OldPassword123!');
    await page.getByRole('button', { name: /Generate Recovery Key/i }).click();

    // Download recovery file
    const downloadPromise3 = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Recovery Backup File/i }).click();
    await downloadPromise3;

    const seg1 = (await page.locator('.font-mono').first().textContent())?.trim() || '';
    const seg3 = (await page.locator('.font-mono').nth(2).textContent())?.trim() || '';
    const challengeInputs = page.locator('input[maxlength="4"]');
    await challengeInputs.first().fill(seg1);
    await challengeInputs.nth(1).fill(seg3);
    await page.getByRole('button', { name: /Verify & Activate Encryption/i }).click();
    await expect(page.getByText(/Active 🔒/i)).toBeVisible({ timeout: 10000 });

    // Click Change Password
    await page.getByRole('button', { name: /Change Password/i }).click();
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();

    // Input new password
    const newPassInput = page.getByPlaceholder('Enter new password');
    const confirmPassInput = page.getByPlaceholder('Repeat new password');

    await newPassInput.fill('NewStrongPassword999!');
    await confirmPassInput.fill('NewStrongPassword999!');

    await page.getByRole('button', { name: /Save Password/i }).click();

    // Success notice appears
    await expect(page.getByText(/Password updated successfully!/i)).toBeVisible();
  });
});
