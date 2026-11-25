import { expect, test } from "@playwright/test";

// Emailed links (sign-up confirmation, password reset) open a page with a
// button, and only the button uses the link up. Email scanners and link
// previews open links before people click them; when opening the address
// used the link, people's own click landed on "That link has expired" even
// though their email had just been confirmed (production, 2026-11-25).

test("opening a confirmation link shows a button and stays put", async ({
  page,
}) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email");
  await expect(page).toHaveURL(/\/auth\/confirm\?/);
  await expect(
    page.getByRole("button", { name: "Confirm my email" }),
  ).toBeVisible();
});

test("opening a password-reset link asks to continue", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=recovery");
  await expect(page).toHaveURL(/\/auth\/confirm\?/);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("a link without a token or a known type goes to the expired page", async ({
  page,
}) => {
  for (const query of [
    "",
    "type=email",
    "token_hash=abc",
    "token_hash=abc&type=signup",
  ]) {
    await page.goto(`/auth/confirm?${query}`);
    await expect(page, query).toHaveURL(/\/link-expired$/);
  }
});

test("pressing the button on a bad or used link shows the expired page", async ({
  page,
}) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).toHaveURL(/\/link-expired$/);
  await expect(
    page.getByRole("heading", { name: "That link has expired" }),
  ).toBeVisible();
});
