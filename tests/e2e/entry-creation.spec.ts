import { test, expect } from '@playwright/test';
import { setupSupabaseMocks, injectAuthenticatedSession } from './fixtures/mock-supabase';

test.describe('Daily Entry Creation & Auto-Save Flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthenticatedSession(page);
    await setupSupabaseMocks(page);
  });

  test('creates a complete morning reflection with mood, priorities, why, and auto-saves', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app/);

    // 1. Fill Daily Note
    const dailyNoteInput = page.getByPlaceholder(/What made today special\?/i);
    await dailyNoteInput.fill('Kickstarting end-to-end test verification');

    // 2. Select Morning Mood & Intensity
    const goodMoodBtn = page.getByRole('button', { name: /Mood: Good/i });
    await goodMoodBtn.click();
    await expect(goodMoodBtn).toHaveAttribute('aria-pressed', 'true');

    // Select Intensity 4
    const intensity4Btn = page.locator('.intensity-dot').nth(3); // 1-indexed 4th button
    await intensity4Btn.click();
    await expect(intensity4Btn).toHaveClass(/selected/);

    // 3. Fill "My WHY today"
    const whyInput = page.getByPlaceholder(/Why am I showing up today\?/i);
    await whyInput.fill('Delivering reliable, production-ready software');

    // 4. Fill Top 3 Priorities
    const priority1 = page.getByPlaceholder('Priority 1');
    const priority2 = page.getByPlaceholder('Priority 2');
    const priority3 = page.getByPlaceholder('Priority 3');

    await priority1.fill('Build Playwright E2E test suites');
    await priority2.fill('Generate Postman API collection');
    await priority3.fill('Configure GitHub Actions CI workflow');

    // Toggle completion checkbox for Priority 1
    const checkbox1 = page.getByRole('checkbox', { name: /Priority 1 completion/i });
    await checkbox1.click();
    await expect(checkbox1).toHaveAttribute('aria-checked', 'true');

    // 5. Fill Plan of Action Step 1
    const step1 = page.getByPlaceholder('Step 1');
    await step1.fill('Inspect DOM selectors and mock network endpoints');
    const stepCheckbox1 = page.getByRole('checkbox', { name: /Step 1 completion/i });
    await stepCheckbox1.click();
    await expect(stepCheckbox1).toHaveAttribute('aria-checked', 'true');

    // 6. Fill Morning Brain Dump
    const brainDump = page.getByPlaceholder(/Write anything on your mind…/i);
    await brainDump.fill('Stay calm, write clean decoupled tests, verify all edge cases.');

    // 7. Verify Auto-Save status indicator
    // After debounce (500ms), status changes to "Saved"
    await page.waitForTimeout(700);
    const saveIndicator = page.locator('text=Saved');
    await expect(saveIndicator).toBeVisible();
  });

  test('navigates dates using previous/next buttons and "Jump to Today"', async ({ page }) => {
    await page.goto('/app');

    // Click Previous Day (< button)
    const prevDayBtn = page.getByRole('button', { name: /Previous day/i });
    await prevDayBtn.click();

    // URL should have ?date= parameter
    await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}/);

    // "Jump to Today" button appears
    const jumpToTodayBtn = page.getByRole('button', { name: /Jump to Today/i });
    await expect(jumpToTodayBtn).toBeVisible();

    // Clicking "Jump to Today" clears param or returns to today's date
    await jumpToTodayBtn.click();
    await expect(jumpToTodayBtn).not.toBeVisible();
  });

  test('logs evening reflection, gratitudes, water hydration, and wind-down on unlocked date', async ({ page }) => {
    // Navigate to yesterday where the night planner is fully unlocked (past dates unlocked)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await page.goto(`/app?date=${yesterdayStr}`);

    // Switch to Night tab
    const nightTabBtn = page.getByRole('button', { name: /Night/i });
    await nightTabBtn.click();
    await expect(nightTabBtn).toHaveClass(/active/);

    // Select Night Mood: Amazing
    const amazingMoodBtn = page.getByRole('button', { name: /Mood: Amazing/i });
    await amazingMoodBtn.click();
    await expect(amazingMoodBtn).toHaveAttribute('aria-pressed', 'true');

    // Select Intensity 5
    const intensity5Btn = page.locator('.intensity-dot').nth(4);
    await intensity5Btn.click();

    // Fill 3 Gratitudes
    const gratitude1 = page.getByPlaceholder('Gratitude 1');
    const gratitude2 = page.getByPlaceholder('Gratitude 2');
    const gratitude3 = page.getByPlaceholder('Gratitude 3');

    await gratitude1.fill('Clean architecture and reliable tests');
    await gratitude2.fill('Sunny afternoon walk');
    await gratitude3.fill('Hot cup of herbal tea');

    // Fill Daily Wins & Lessons
    const winInput = page.getByPlaceholder(/What was my win today\?/i);
    await winInput.fill('All core feature milestones completed ahead of schedule');

    const improveInput = page.getByPlaceholder(/What can I improve tomorrow…/i);
    await improveInput.fill('Take more micro-breaks away from the screen');

    // Water Tracker increment
    const addWaterBtn = page.getByRole('button', { name: /Drink one glass/i });
    await addWaterBtn.click();
    await addWaterBtn.click();

    // Check count increased
    await expect(page.locator('text=Glasses').locator('..').getByText('2')).toBeVisible();

    // Night Brain Dump
    const nightBrainDump = page.getByPlaceholder(/Get it all out…/i);
    await nightBrainDump.fill('Mind is at peace, ready for restful sleep.');

    // Tomorrow intention
    const intentionInput = page.getByPlaceholder(/Tomorrow I will…/i);
    await intentionInput.fill('Wake up refreshed and tackle new challenges');

    // Verify auto-save
    await page.waitForTimeout(700);
    await expect(page.locator('text=Saved')).toBeVisible();
  });
});
