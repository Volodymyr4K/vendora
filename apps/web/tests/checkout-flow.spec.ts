import { test, expect } from "@playwright/test";

test("checkout flow: add item -> checkout -> create order -> status page", async ({ page }) => {
  // Open category (mock data гарантирует наличие товаров)
  await page.goto("/kyiv-bazhana/menu/sets");

  // Add first item to cart
  await page.getByRole("button", { name: "+ У кошик" }).first().click();

  // Go to cart/checkout
  await page.getByRole("link", { name: "🧺 Кошик" }).click();
  await expect(page).toHaveURL(/\/kyiv-bazhana\/checkout/);

  // Ensure quote visible (total)
  await expect(page.locator("text=Разом").first()).toBeVisible();

  // Fill required fields (phone)
  await page.getByLabel("Телефон").fill("+380501234567");

  // Submit order
  await page.getByRole("button", { name: /Оформити/ }).click();

  // Redirect to status page
  await expect(page).toHaveURL(/\/kyiv-bazhana\/order\//);
  await expect(page.locator("text=Статус").first()).toBeVisible();
});
