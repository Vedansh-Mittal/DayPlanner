import { test, expect } from '@playwright/test';
import { setupSupabaseMocks, injectAuthenticatedSession } from './fixtures/mock-supabase';

test.describe('App Navigation & History Archive Flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthenticatedSession(page);
    await setupSupabaseMocks(page);
  });

  test('navigates through all core routes via sidebar/layout links', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app/);

    // 1. History
    await page.getByRole('link', { name: /History/i }).first().click();
    await expect(page).toHaveURL(/\/app\/history/);
    await expect(page.getByRole('heading', { name: /History & Memory Archive/i })).toBeVisible();

    // 2. Insights
    await page.getByRole('link', { name: /Insights/i }).first().click();
    await expect(page).toHaveURL(/\/app\/insights/);
    await expect(page.getByRole('heading', { name: /Insights/i }).first()).toBeVisible();

    // 3. Security
    await page.getByRole('link', { name: /Security/i }).first().click();
    await expect(page).toHaveURL(/\/app\/security/);
    await expect(page.getByRole('heading', { name: /Security & Privacy/i })).toBeVisible();

    // 4. Settings
    await page.getByRole('link', { name: /Settings/i }).first().click();
    await expect(page).toHaveURL(/\/app\/settings/);
    await expect(page.getByRole('heading', { name: /Settings/i }).first()).toBeVisible();

    // 5. Back to Today
    await page.getByRole('link', { name: /Today/i }).first().click();
    await expect(page).toHaveURL(/\/app/);
  });

  test('searches history archive notes and filters entries', async ({ page }) => {
    await page.goto('/app/history');

    const searchInput = page.getByPlaceholder(/Search notes, priorities, reflections…/i);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('mindfulness');
    await page.getByRole('button', { name: 'Search' }).click();

    // Shows search feedback (either results or empty state)
    await expect(page.locator('.mt-4.space-y-3')).toBeVisible();
  });
});
