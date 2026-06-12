import { test, expect } from "@playwright/test";

test("checkout flow: add item -> checkout -> create order -> status page", async ({ page }) => {
  // Open category (mock data guarantees items exist)
  await page.goto("/kyiv-bazhana/menu/sets");

  // Add first item to cart
  await page.getByRole("button", { name: "+ Add to cart" }).first().click();

  // Go to cart/checkout
  await page.getByRole("link", { name: "🧺 Cart" }).click();
  await expect(page).toHaveURL(/\/kyiv-bazhana\/checkout/);

  // Ensure quote visible (total)
  await expect(page.locator("text=Total").first()).toBeVisible();

  // Fill required fields (phone)
  await page.getByLabel("Phone").fill("+380501234567");

  // Submit order
  await page.getByRole("button", { name: /Place order/ }).click();

  // Redirect to status page
  await expect(page).toHaveURL(/\/kyiv-bazhana\/order\//);
  await expect(page.locator("text=Status").first()).toBeVisible();
});
