import { expect, test } from "@playwright/test";

// Smoke tests for what a signed-out visitor sees. They need no test account:
// the signed-in flows are covered by the pgTAP and unit tests.

test("the home page loads and links to sign-up", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole("link", { name: /sign up|get started/i }).first(),
  ).toBeVisible();
});

test("the login form has an email field and a password field", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("the terms and privacy pages load", async ({ page }) => {
  // The first request compiles the page in dev mode, which can be slow.
  test.setTimeout(90_000);
  for (const path of ["/terms", "/privacy"]) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
  }
});

test("a signed-out visitor is sent to log in from the portal", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);
});

test("no page scrolls sideways", async ({ page }) => {
  for (const path of ["/", "/login", "/signup", "/terms"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
