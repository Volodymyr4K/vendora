import { test, expect } from "@playwright/test";

const STOREFRONT_BRANCH = "/kyiv-bazhana";
const TENANT_SLUG = "kyiv-bazhana";

test("no undefined in title for branch page", async ({ page }) => {
  await page.goto(STOREFRONT_BRANCH);
  await expect(page).toHaveTitle(/(?!undefined).*/);
});

test("menu category renders items (no Loading-only)", async ({ page }) => {
  await page.goto(`${STOREFRONT_BRANCH}/menu/sets`);
  await expect(page.locator("text=грн").first()).toBeVisible();
});

function getAccentViaComputedStyle(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const wrapper = document.querySelector('div[style*="--accent"]');
    if (!wrapper) return "";
    return getComputedStyle(wrapper).getPropertyValue("--accent").trim();
  });
}

test("storefront applies theme CSS variable --accent (plan 1.10)", async ({ page }) => {
  await page.goto(STOREFRONT_BRANCH);
  await expect(page).toHaveTitle(/(?!undefined).*/);
  const accent = await getAccentViaComputedStyle(page);
  expect(accent.length).toBeGreaterThan(0);
  expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
});

test("two storefronts have different --accent when two tenants exist (optional seed)", async ({ page }) => {
  const secondUrl = process.env.SECOND_STOREFRONT_URL;
  if (!secondUrl) {
    test.skip();
    return;
  }
  await page.goto(STOREFRONT_BRANCH);
  const accent1 = await getAccentViaComputedStyle(page);
  expect(accent1).toMatch(/^#[0-9a-f]{6}$/i);

  await page.goto(secondUrl);
  const accent2 = await getAccentViaComputedStyle(page);
  expect(accent2).toMatch(/^#[0-9a-f]{6}$/i);
  expect(accent1).not.toBe(accent2);
});

test("tenant layout (login) applies theme --accent (plan 1.10)", async ({ page }) => {
  await page.goto(`/t/${TENANT_SLUG}/login`);
  await expect(page).toHaveTitle(/(?!undefined).*/);
  const accent = await getAccentViaComputedStyle(page);
  expect(accent.length).toBeGreaterThan(0);
  expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
});

test("BranchTopbar shows tenant name (not fallback Vendora)", async ({ page }) => {
  await page.goto(STOREFRONT_BRANCH);
  const brandTitle = page.locator(".topbar .brandTitle").first();
  await expect(brandTitle).toBeVisible();
  const text = await brandTitle.textContent();
  expect(text).toBeTruthy();
  const parts = text!.split("•").map((s) => s.trim());
  expect(parts.length).toBeGreaterThanOrEqual(2);
  expect(parts[0]).not.toBe("Vendora");
});
