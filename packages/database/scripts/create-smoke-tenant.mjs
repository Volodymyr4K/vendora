#!/usr/bin/env node
/**
 * Creates/updates a dedicated local "smoke" tenant + owner user.
 *
 * Safety:
 * - Refuses to run against non-local DATABASE_URL hosts (e.g. Neon).
 *
 * Env (optional):
 * - SMOKE_TENANT_SLUG (default: smoke-upload-media)
 * - SMOKE_TENANT_NAME (default: Smoke Upload/Media)
 * - SMOKE_BRANCH_SLUG (default: hq)
 * - SMOKE_ADMIN_EMAIL (default: smoke-admin@local.test)
 * - SMOKE_ADMIN_PASSWORD (default: generated and printed)
 *
 * Required:
 * - DATABASE_URL (must point to local postgres)
 */

import process from "node:process";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function env(name, fallback) {
  const v = (process.env[name] || "").trim();
  return v || fallback;
}

function randomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function isLocalDbUrl(raw) {
  try {
    const u = new URL(raw);
    const host = (u.hostname || "").toLowerCase();
    const allowedHosts = new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      "postgres",
      "host.docker.internal",
    ]);
    if (allowedHosts.has(host)) return true;
    if (host.endsWith(".local")) return true;
    return false;
  } catch {
    return false;
  }
}

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is required");
    process.exitCode = 2;
    return;
  }
  if (!isLocalDbUrl(databaseUrl)) {
    console.error("❌ Refusing to run: DATABASE_URL does not look local.");
    console.error("Set DATABASE_URL to local postgres (e.g. localhost:5432).");
    process.exitCode = 3;
    return;
  }

  const tenantSlug = env("SMOKE_TENANT_SLUG", "smoke-upload-media");
  const tenantName = env("SMOKE_TENANT_NAME", "Smoke Upload/Media");
  const branchSlug = env("SMOKE_BRANCH_SLUG", "hq");

  const adminEmail = env("SMOKE_ADMIN_EMAIL", "smoke-admin@local.test");
  const adminPassword = env("SMOKE_ADMIN_PASSWORD", randomPassword());

  const features = {
    version: 1,
    modules: {
      profile: true,
      ordering: true,
      delivery: true,
      menu: true,
      customerProfiles: true,
      orderHistory: true,
      savedAddresses: true,
      favorites: true,
      cartCheckout: true,
      scheduledOrdering: true,
      quickReorder: true,
      basicDelivery: true,
    },
    adminModules: {
      admin_dashboard: true,
      admin_orders: true,
      admin_users: true,
      admin_catalog_products: true,
      admin_catalog_categories: true,
      admin_catalog_menu: true,
      admin_catalog_nutrition: true,
      admin_catalog_allergens: true,
      admin_catalog_option_groups: true,
      admin_catalog_offers: true,
      admin_catalog_attribute_definitions: true,
      admin_catalog_attribute_values: true,
      admin_integrations: true,
      admin_delivery_config: true,
      admin_settings: true,
      admin_media: true,
      admin_content: true,
    },
    capabilities: [],
  };

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      slug: tenantSlug,
      name: tenantName,
      isActive: true,
      features,
      settings: { mainTemplate: "default" },
    },
    update: {
      name: tenantName,
      isActive: true,
      features,
      settings: { mainTemplate: "default" },
    },
    select: { id: true, slug: true },
  });

  const branch = await prisma.branch.upsert({
    where: { slug_tenantId: { slug: branchSlug, tenantId: tenant.id } },
    create: {
      tenantId: tenant.id,
      slug: branchSlug,
      cityName: "Smoke City",
      address: "Smoke Address",
      phones: ["+0000000000"],
      zones: [],
      isActive: true,
    },
    update: {
      cityName: "Smoke City",
      address: "Smoke Address",
      phones: ["+0000000000"],
      zones: [],
      isActive: true,
    },
    select: { id: true, slug: true },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { defaultBranchId: branch.id },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      password: passwordHash,
      role: "admin",
    },
    update: {
      password: passwordHash,
      role: "admin",
    },
    select: { id: true, email: true },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    create: { tenantId: tenant.id, userId: user.id, role: "TENANT_OWNER" },
    update: { role: "TENANT_OWNER" },
    select: { id: true },
  });

  console.log("✅ Smoke tenant ready");
  console.log(`- tenantSlug: ${tenant.slug}`);
  console.log(`- branchSlug: ${branch.slug}`);
  console.log(`- adminEmail: ${user.email}`);
  console.log(`- adminPassword: ${adminPassword}`);
  console.log("");
  console.log("Next (manual sanity check):");
  console.log(`- Open storefront: http://localhost:3000/t/${tenant.slug}/${branch.slug}`);
  console.log(`- Open admin:      http://localhost:3000/t/${tenant.slug}/${branch.slug}/admin/login`);
  console.log(`- Upload any image in admin content → it should return a /media/... url and render via WEB proxy.`);
}

main()
  .catch((err) => {
    console.error("❌ create-smoke-tenant failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
