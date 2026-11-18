import { expect, test } from "@playwright/test";

// The two audience pages. A visitor on one is already a business or a
// creator, so every sign-up button on it carries that role and sign-up
// doesn't ask again.

test("/for-business loads and signs up as a business", async ({ page }) => {
  test.setTimeout(90_000); // first request compiles the page in dev mode
  const response = await page.goto("/for-business");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await expect(
    page.getByRole("banner").getByRole("link", { name: "Get started" }),
  ).toHaveAttribute("href", "/signup?role=business");

  await page
    .getByRole("main")
    .getByRole("link", { name: /create a business account/i })
    .first()
    .click();
  // Generous: /signup may compile on first visit in dev mode.
  await expect(page).toHaveURL(/\/signup\?role=business/, { timeout: 30_000 });
  await expect(page.getByText("Signing up as a business")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("/for-creators loads and signs up as a creator", async ({ page }) => {
  test.setTimeout(90_000);
  const response = await page.goto("/for-creators");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await expect(
    page.getByRole("banner").getByRole("link", { name: "Get started" }),
  ).toHaveAttribute("href", "/signup?role=influencer");

  await page
    .getByRole("main")
    .getByRole("link", { name: /create a creator account/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signup\?role=influencer/, {
    timeout: 30_000,
  });
  await expect(page.getByText("Signing up as a creator")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("the home page sends each side to its page", async ({ page }) => {
  await page.goto("/");
  // Old links to /#for-creators and /#for-businesses land on these cards.
  await expect(page.locator("#for-creators")).toHaveCount(1);
  await expect(page.locator("#for-businesses")).toHaveCount(1);
  await expect(
    page
      .locator("#for-creators")
      .getByRole("link", { name: /for creators|see how it works/i })
      .first(),
  ).toHaveAttribute("href", "/for-creators");
  await expect(
    page
      .locator("#for-businesses")
      .getByRole("link", { name: /for businesses|see how it works/i })
      .first(),
  ).toHaveAttribute("href", "/for-business");
});

test("the header links to the audience pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "phones use the menu");
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "For creators" }),
  ).toHaveAttribute("href", "/for-creators");
  await expect(
    header.getByRole("link", { name: "For businesses" }),
  ).toHaveAttribute("href", "/for-business");
});

test("the sitemap lists both audience pages", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/for-business</loc>");
  expect(xml).toContain("/for-creators</loc>");
});

// Copy must match what is built: campaign browsing has search, niche,
// platform and "campaigns you qualify for", not location or budget filters.
test("creator copy claims only filters that exist", async ({ page }) => {
  for (const path of ["/for-creators", "/"]) {
    await page.goto(path);
    const main = page.getByRole("main");
    await expect(main, path).not.toContainText(/location and budget/i);
    await expect(main, path).not.toContainText(/niche and city/i);
    await expect(main, path).not.toContainText("₦20,000+");
  }
});

// Money wording: the fee isn't refunded when the business cancels after
// paying, a creator's withdrawal is a refund (not "all the money"), and a
// creator who never started is cancelled, not disputed (CLAUDE.md §6.2).
test("business copy states refunds exactly", async ({ page }) => {
  await page.goto("/for-business");
  const main = page.getByRole("main");
  await expect(main).not.toContainText(/which part of the fee/i);
  await expect(main).not.toContainText(
    /the money comes back to your Pitchype wallet/i,
  );
  await expect(main).toContainText(/cancel the hire/i);
});
