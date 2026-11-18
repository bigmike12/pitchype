import { expect, test } from "@playwright/test";

// A visitor who arrives from an audience page (or a "Join as…" button) has
// already chosen a side, so sign-up doesn't ask again.

for (const { role, words } of [
  { role: "influencer", words: "Signing up as a creator" },
  { role: "business", words: "Signing up as a business" },
]) {
  test(`/signup?role=${role} skips the picker and keeps the role`, async ({
    page,
  }) => {
    await page.goto(`/signup?role=${role}`);
    await expect(page.getByText(words)).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    // Plain hidden input: it is submitted even if JavaScript hasn't loaded.
    await expect(page.locator('input[type="hidden"][name="role"]')).toHaveValue(
      role,
    );
    await expect(page.getByRole("link", { name: "Change" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
}

test("/signup with no role shows both account types", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByText(/Signing up as/)).toHaveCount(0);
});

test("a bad or repeated role falls back to the picker", async ({ page }) => {
  for (const query of [
    "role=Business",
    "role=admin",
    "role=influencer&role=business",
  ]) {
    await page.goto(`/signup?${query}`);
    await expect(page.getByRole("radio"), query).toHaveCount(2);
  }
});
