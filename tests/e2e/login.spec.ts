import { test, expect } from '@playwright/test';
import { setupSupabaseMocks, injectAuthenticatedSession } from './fixtures/mock-supabase';

test.describe('Login & Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss security modal and welcome splash
    await page.addInitScript(() => {
      sessionStorage.setItem('dayplanner_welcome_shown', 'true');
      localStorage.setItem('mewwmory_security_notice_v1_shown', 'true');
    });
  });

  test('redirects unauthenticated user from protected routes to /login', async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('Mewwmory');
    await expect(page.locator('#magic-email-destination')).toBeVisible();
  });

  test('validates email input and submits magic link / OTP request', async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto('/login');

    const emailInput = page.locator('#magic-email-destination');
    const submitBtn = page.getByRole('button', { name: /Send Login Link & Code/i });

    // Submit button disabled when email is empty
    await expect(submitBtn).toBeDisabled();

    // Type valid email
    await emailInput.click();
    await emailInput.fill('mindful.user@daylight.app');
    await expect(submitBtn).toBeEnabled();

    // Click send
    await submitBtn.click();

    // Verification screen appears
    await expect(page.getByRole('heading', { name: /Check your email!/i })).toBeVisible();
    await expect(page.locator('#otp-code-input')).toBeVisible();
    await expect(page.getByText('mindful.user@daylight.app')).toBeVisible();
  });

  test('allows user to switch back to email input via "Use a different email"', async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto('/login');

    const emailInput = page.locator('#magic-email-destination');
    await emailInput.click();
    await emailInput.fill('first.attempt@daylight.app');
    await page.getByRole('button', { name: /Send Login Link & Code/i }).click();

    await expect(page.locator('#otp-code-input')).toBeVisible();

    // Click "Use a different email"
    await page.getByRole('button', { name: /Use a different email/i }).click();

    // Back on initial email screen
    await expect(page.locator('#magic-email-destination')).toBeVisible();
  });

  test('displays error message when entering an invalid or expired OTP code', async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.goto('/login');

    const emailInput = page.locator('#magic-email-destination');
    await emailInput.click();
    await emailInput.fill('tester@daylight.app');
    await page.getByRole('button', { name: /Send Login Link & Code/i }).click();

    // Enter bad token ('000000' mocked as invalid)
    const otpInput = page.locator('#otp-code-input');
    await otpInput.fill('000000');
    await page.getByRole('button', { name: /Verify & Sign In/i }).click();

    // Error alert displayed
    await expect(page.getByText(/Invalid or expired code/i)).toBeVisible();
  });

  test('successfully verifies OTP code and navigates to the planner app', async ({ page }) => {
    await setupSupabaseMocks(page, { onboardingComplete: true });
    await page.goto('/login');

    const emailInput = page.locator('#magic-email-destination');
    await emailInput.click();
    await emailInput.fill('alex@daylight.app');
    await page.getByRole('button', { name: /Send Login Link & Code/i }).click();

    // Enter valid 6-digit OTP code
    const otpInput = page.locator('#otp-code-input');
    await otpInput.fill('123456');
    await page.getByRole('button', { name: /Verify & Sign In/i }).click();

    // Navigates into protected planner application
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByText(/Today/i).first()).toBeVisible();
  });

  test('navigates first-time users to onboarding if onboarding_complete is false', async ({ page }) => {
    await setupSupabaseMocks(page, { onboardingComplete: false });
    await page.goto('/login');

    const emailInput = page.locator('#magic-email-destination');
    await emailInput.click();
    await emailInput.fill('newuser@daylight.app');
    await page.getByRole('button', { name: /Send Login Link & Code/i }).click();

    await page.locator('#otp-code-input').fill('123456');
    await page.getByRole('button', { name: /Verify & Sign In/i }).click();

    // Routed to onboarding wizard
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('allows authenticated user to sign out from settings page', async ({ page }) => {
    await injectAuthenticatedSession(page);
    await setupSupabaseMocks(page);

    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/app\/settings/);

    // Click Sign Out
    const signOutBtn = page.getByRole('button', { name: /Log out|Sign out/i }).first();
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // Redirected to login
    await expect(page).toHaveURL(/\/login/);
  });
});
