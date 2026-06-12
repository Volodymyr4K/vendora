/**
 * E2E: Real PATCH → invalidation → GET sees new theme (no Prisma mocks).
 * Proves that after PATCH /super/tenants/:tenantId/theme the next GET /config
 * (and storefront page) returns the new accent via real cache invalidation + DB.
 *
 * Runs only when env is set (real BFF + DB):
 *   E2E_THEME_CHAIN_TEST=1
 *   E2E_SUPER_ADMIN_EMAIL=...
 *   E2E_SUPER_ADMIN_PASSWORD=...
 *   E2E_TENANT_ID=... (UUID of the tenant to patch)
 *   E2E_TENANT_SLUG=kyiv-bazhana (optional, for GET /config x-tenant-slug)
 *   BFF_BASE_URL=http://localhost:4000 (optional)
 */

import { test, expect } from "@playwright/test";

const BFF_URL = process.env.BFF_BASE_URL || "http://localhost:4000";
const TENANT_SLUG = process.env.E2E_TENANT_SLUG || "kyiv-bazhana";

const hasThemeChainEnv =
  !!process.env.E2E_THEME_CHAIN_TEST &&
  !!process.env.E2E_SUPER_ADMIN_EMAIL &&
  !!process.env.E2E_SUPER_ADMIN_PASSWORD &&
  !!process.env.E2E_TENANT_ID;

test.describe("Theme chain (PATCH → GET sees new theme)", () => {
  test.skip(!hasThemeChainEnv, "Set E2E_THEME_CHAIN_TEST, E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD, E2E_TENANT_ID to run");

  test("GET /config → accent A; PATCH theme → 204; GET /config → accent B", async ({
    page,
    context,
  }) => {
    const tenantId = process.env.E2E_TENANT_ID!;

    await page.goto("/super-admin/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_SUPER_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /Login/i }).click();
    await expect(page).toHaveURL(/\/super-admin/);
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === "auth_token");
    if (!authCookie?.value) {
      throw new Error("No auth_token cookie after super-admin login");
    }
    const token = authCookie.value;

    const getConfig = async () => {
      const res = await fetch(`${BFF_URL}/config`, {
        headers: { "x-tenant-slug": TENANT_SLUG },
      });
      if (!res.ok) throw new Error(`GET /config ${res.status}`);
      const data = (await res.json()) as { theme?: { tokens?: { accent?: string } } };
      return data.theme?.tokens?.accent ?? "";
    };

    const accentBefore = await getConfig();
    expect(accentBefore).toMatch(/^#[0-9a-f]{6}$/i);

    const newAccent = "#ff0000";
    const patchRes = await fetch(`${BFF_URL}/super/tenants/${tenantId}/theme`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        preset: "default",
        tokens: { accent: newAccent },
      }),
    });
    expect(patchRes.status).toBe(204);

    const accentAfter = await getConfig();
    expect(accentAfter.toLowerCase()).toBe(newAccent.toLowerCase());
  });

    test("storefront page: PATCH theme → reload → --accent updated", async ({
    page,
    context,
  }) => {
    const tenantId = process.env.E2E_TENANT_ID!;

    await page.goto("/super-admin/login");
    await page.getByLabel("Email").fill(process.env.E2E_SUPER_ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_SUPER_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /Login/i }).click();
    await expect(page).toHaveURL(/\/super-admin/);
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === "auth_token");
    if (!authCookie?.value) {
      throw new Error("No auth_token cookie after super-admin login");
    }
    const token = authCookie.value;

    await page.goto(`/${TENANT_SLUG}`);
    const accentBefore = await page.evaluate(() => {
      const el = document.querySelector('div[style*="--accent"]');
      return el ? getComputedStyle(el).getPropertyValue("--accent").trim() : "";
    });
    expect(accentBefore).toMatch(/^#[0-9a-f]{6}$/i);

    const newAccent = "#00ff00";
    const patchRes = await fetch(`${BFF_URL}/super/tenants/${tenantId}/theme`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        preset: "default",
        tokens: { accent: newAccent },
      }),
    });
    expect(patchRes.status).toBe(204);

    await page.reload();
    const accentAfter = await page.evaluate(() => {
      const el = document.querySelector('div[style*="--accent"]');
      return el ? getComputedStyle(el).getPropertyValue("--accent").trim() : "";
    });
    expect(accentAfter.toLowerCase()).toBe(newAccent.toLowerCase());
  });
});
