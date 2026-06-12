import { describe, it, expect, vi } from "vitest";
import type { SelectComponent } from "@/lib/components/select-registry";
import type { TopbarComponent } from "@/lib/components/topbar-registry";

type OverrideInitGuards = typeof globalThis & {
  __vendoraButtonOverridesInitialized?: boolean;
  __vendoraCardOverridesInitialized?: boolean;
  __vendoraInputOverridesInitialized?: boolean;
};

function resetOverrideInitGuards(): void {
  const g = globalThis as OverrideInitGuards;
  g.__vendoraButtonOverridesInitialized = undefined;
  g.__vendoraCardOverridesInitialized = undefined;
  g.__vendoraInputOverridesInitialized = undefined;
}

async function loadOverrideModules() {
  resetOverrideInitGuards();
  vi.resetModules();

  // Ensure module-load initializers run (and re-run after resetModules)
  await import("@/lib/theme/component-overrides/registry");

  const buttonRegistry = await import("@/lib/components/button-registry");
  const cardRegistry = await import("@/lib/components/card-registry");
  const inputRegistry = await import("@/lib/components/input-registry");
  const overrides = await import("@/lib/theme/component-overrides/registry");

  return { buttonRegistry, cardRegistry, inputRegistry, overrides };
}

describe("tenant override runtime (non-visual)", () => {
  it("getThemedButton returns tenant override when key matches", async () => {
    const { buttonRegistry, overrides } = await loadOverrideModules();
    const componentSet = "default";
    const tenantOverrideKey = "vendora-sushi-hq";

    const Button = buttonRegistry.getThemedButton({ componentSet, tenantOverrideKey });
    const override = overrides.getTenantOverrideButtonComponent(
      tenantOverrideKey,
      componentSet,
      "default"
    );

    expect(override).not.toBeNull();
    expect(Button).toBe(override);
  });

  it("getThemedCard returns tenant override when key matches", async () => {
    const { cardRegistry, overrides } = await loadOverrideModules();
    const componentSet = "default";
    const tenantOverrideKey = "vendora-sushi-hq";

    const Card = cardRegistry.getThemedCard({ componentSet, tenantOverrideKey });
    const override = overrides.getTenantOverrideCardComponent(
      tenantOverrideKey,
      componentSet,
      "default"
    );

    expect(override).not.toBeNull();
    expect(Card).toBe(override);
  });

  it("getThemedInput returns tenant override when key matches", async () => {
    const { inputRegistry, overrides } = await loadOverrideModules();
    const componentSet = "default";
    const tenantOverrideKey = "vendora-sushi-hq";

    const Input = inputRegistry.getThemedInput({ componentSet, tenantOverrideKey });
    const override = overrides.getTenantOverrideInputComponent(
      tenantOverrideKey,
      componentSet,
      "default"
    );

    expect(override).not.toBeNull();
    expect(Input).toBe(override);
  });

  it("canonicalization (trim + lowercase) works for Button", async () => {
    const { buttonRegistry, overrides } = await loadOverrideModules();
    const componentSet = "default";

    const canonical = "vendora-sushi-hq";
    const messy = "  VeNdOrA-SuShI-Hq  ";

    const Button = buttonRegistry.getThemedButton({
      componentSet,
      tenantOverrideKey: messy,
    });
    const override = overrides.getTenantOverrideButtonComponent(
      canonical,
      componentSet,
      "default"
    );

    expect(override).not.toBeNull();
    expect(Button).toBe(override);
  });

  it("fallback works: unknown tenant -> base Button", async () => {
    const { buttonRegistry } = await loadOverrideModules();
    const componentSet = "default";

    const Button = buttonRegistry.getThemedButton({
      componentSet,
      tenantOverrideKey: "unknown-tenant",
    });
    const Base = buttonRegistry.getButton(componentSet);

    expect(Button).toBe(Base);
  });

  it("fallback works: empty/undefined key -> base Button", async () => {
    const { buttonRegistry } = await loadOverrideModules();
    const componentSet = "default";
    const Base = buttonRegistry.getButton(componentSet);

    const ButtonUndefined = buttonRegistry.getThemedButton({
      componentSet,
      tenantOverrideKey: undefined,
    });
    const ButtonEmpty = buttonRegistry.getThemedButton({
      componentSet,
      tenantOverrideKey: "",
    });

    expect(ButtonUndefined).toBe(Base);
    expect(ButtonEmpty).toBe(Base);
  });

  it("getThemedSelect returns a tenant override when registered", async () => {
    resetOverrideInitGuards();
    vi.resetModules();

    await import("@/lib/theme/component-overrides/registry");
    const { registerTenantSelectOverride } = await import(
      "@/lib/theme/component-overrides/registry"
    );
    const { getThemedSelect } = await import("@/lib/components/select-registry");

    const componentSet = "default";
    const tenantOverrideKey = "unit-test-tenant";

    const mockOverride: SelectComponent = () => null;

    registerTenantSelectOverride(
      tenantOverrideKey,
      componentSet,
      "default",
      mockOverride
    );

    const Select = getThemedSelect({
      componentSet,
      tenantOverrideKey,
    });

    expect(Select).toBe(mockOverride);
  });

  it("getThemedTopbar returns a tenant override when registered", async () => {
    resetOverrideInitGuards();
    vi.resetModules();

    await import("@/lib/theme/component-overrides/registry");
    const { registerTenantTopbarOverride } = await import(
      "@/lib/theme/component-overrides/registry"
    );
    const { getThemedTopbar } = await import("@/lib/components/topbar-registry");

    const componentSet = "default";
    const tenantOverrideKey = "unit-test-tenant";

    const mockOverride: TopbarComponent = () => null;

    registerTenantTopbarOverride(
      tenantOverrideKey,
      componentSet,
      "default",
      mockOverride
    );

    const Topbar = getThemedTopbar({
      componentSet,
      tenantOverrideKey,
    });

    expect(Topbar).toBe(mockOverride);
  });
});
