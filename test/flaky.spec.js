// test/flaky.spec.js
// Three intentional flaky test patterns — one per root cause category.
// Run these against a real CI pipeline to verify FlakeHunt classifies each
// correctly and posts the right fix suggestion.

const { test, expect } = require('@playwright/test');

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 1 · SELECTOR_FRAGILITY
// Symptom : CSS class selector breaks when UI is restyled.
// FlakeHunt should classify as SELECTOR_FRAGILITY and suggest switching to
// a data-testid attribute.
// ─────────────────────────────────────────────────────────────────────────────
test('SELECTOR_FRAGILITY · submit checkout form', async ({ page }) => {
  await page.goto('/checkout');

  // Bad: relies on a CSS class that will change when design system is updated
  await page.click('.btn-primary.submit');

  await expect(page.locator('.confirmation-message')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 2 · ASYNC_TIMING
// Symptom : Hardcoded wait races against dynamic content load time.
// FlakeHunt should classify as ASYNC_TIMING and suggest replacing
// waitForTimeout with waitForSelector or waitForResponse.
// ─────────────────────────────────────────────────────────────────────────────
test('ASYNC_TIMING · dashboard data loads after navigation', async ({ page }) => {
  await page.goto('/dashboard');

  // Bad: assumes data loads within 2 seconds — flaky under slow CI runners
  await page.waitForTimeout(2000);

  const value = await page.textContent('.metric-value');
  expect(value).not.toBeNull();
});

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 3 · DATA_DEPENDENCY
// Symptom : Test assumes a specific user record exists in the database.
// FlakeHunt should classify as DATA_DEPENDENCY and suggest adding a
// beforeEach seed step or using a test fixture.
// ─────────────────────────────────────────────────────────────────────────────
test('DATA_DEPENDENCY · user profile page renders correctly', async ({ page }) => {
  // Bad: hardcoded user that may not exist in CI database
  await page.goto('/users/test@example.com/profile');

  // Fails when DB is reset between runs or on a fresh CI environment
  await expect(page.locator('.user-display-name')).toHaveText('Test User');
});
