/**
 * Component overrides registry.
 * Supports lookup by: tenantOverrideKey -> componentSet -> variant -> component.
 * 
 * Fallback order:
 * 1. tenantOverrideKey + componentSet + variant
 * 2. tenantOverrideKey + componentSet + "default"
 * 3. null + componentSet + variant
 * 4. null + componentSet + "default"
 * 5. null + "default" + variant
 * 6. null + "default" + "default"
 */

import type { ComponentId, ComponentVariant, ComponentSet } from "./types";
import type { ButtonComponent } from "@/lib/components/button-base";
import { buttonRegistry } from "@/lib/components/button-base";
import type { CardComponent } from "@/lib/components/card-base";
import { cardRegistry } from "@/lib/components/card-base";
import type { InputComponent } from "@/lib/components/input-base";
import { inputRegistry } from "@/lib/components/input-base";
import type { SelectComponent } from "@/lib/components/select-base";
import { selectRegistry } from "@/lib/components/select-base";
import type { TextareaComponent } from "@/lib/components/textarea-base";
import { textareaRegistry } from "@/lib/components/textarea-base";
import type { LabelComponent } from "@/lib/components/label-base";
import { labelRegistry } from "@/lib/components/label-base";
import type { CheckboxComponent } from "@/lib/components/checkbox-base";
import { checkboxRegistry } from "@/lib/components/checkbox-base";
import type { BadgeComponent } from "@/lib/components/badge-base";
import { badgeRegistry } from "@/lib/components/badge-base";
import type { RadioComponent } from "@/lib/components/radio-base";
import { radioRegistry } from "@/lib/components/radio-base";
import type { TopbarComponent } from "@/lib/components/topbar-base";
import { topbarRegistry } from "@/lib/components/topbar-base";
import { VendoraSushiHqCardDefault, VendoraSushiHqCardMinimal, VendoraSushiHqCardAcme } from "./components/Card";
import { VendoraSushiHqInputDefault, VendoraSushiHqInputMinimal, VendoraSushiHqInputAcme } from "./components/Input";
import { VendoraSushiHqButtonDefault, VendoraSushiHqButtonMinimal, VendoraSushiHqButtonAcme } from "./components/Button";

// Use button components from button-base.ts (single source of truth)
const buttonComponents = {
    default: buttonRegistry.default,
    minimal: buttonRegistry.minimal,
    acme: buttonRegistry.acme,
} as const;

// Use card components from card-registry.ts (single source of truth)
const cardComponents = {
    default: cardRegistry.default,
    minimal: cardRegistry.minimal,
    acme: cardRegistry.acme,
} as const;

// Use input components from input-base.ts (single source of truth)
const inputComponents = {
    default: inputRegistry.default,
    minimal: inputRegistry.minimal,
    acme: inputRegistry.acme,
} as const;

// Use select components from select-base.ts (single source of truth)
const selectComponents = {
    default: selectRegistry.default,
    minimal: selectRegistry.minimal,
    acme: selectRegistry.acme,
} as const;

// Use textarea components from textarea-base.ts (single source of truth)
const textareaComponents = {
    default: textareaRegistry.default,
    minimal: textareaRegistry.minimal,
    acme: textareaRegistry.acme,
} as const;

// Use label components from label-base.ts (single source of truth)
const labelComponents = {
    default: labelRegistry.default,
    minimal: labelRegistry.minimal,
    acme: labelRegistry.acme,
} as const;

// Use checkbox components from checkbox-base.ts (single source of truth)
const checkboxComponents = {
    default: checkboxRegistry.default,
    minimal: checkboxRegistry.minimal,
    acme: checkboxRegistry.acme,
} as const;

// Use badge components from badge-base.ts (single source of truth)
const badgeComponents = {
    default: badgeRegistry.default,
    minimal: badgeRegistry.minimal,
    acme: badgeRegistry.acme,
} as const;

// Use radio components from radio-base.ts (single source of truth)
const radioComponents = {
    default: radioRegistry.default,
    minimal: radioRegistry.minimal,
    acme: radioRegistry.acme,
} as const;

// Use topbar components from topbar-registry.ts (single source of truth)
const topbarComponents = {
    default: topbarRegistry.default,
    minimal: topbarRegistry.minimal,
    acme: topbarRegistry.acme,
} as const;

/**
 * Registry structure:
 * tenantOverrideKey (string | null) -> componentId -> componentSet -> variant -> component
 */
type ComponentOverrideRegistry = {
    [tenantKey: string]: {
        [componentId in ComponentId]?: {
            [componentSet: string]: {
                [variant: string]: ButtonComponent | CardComponent | InputComponent | SelectComponent | TextareaComponent | LabelComponent | CheckboxComponent | BadgeComponent | RadioComponent | TopbarComponent;
            };
        };
    };
};

/**
 * Base registry with default componentSet mappings for Button.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseButtonRegistry: Record<ComponentSet, Record<ComponentVariant | "default", ButtonComponent>> = {
    default: {
        default: buttonComponents.default,
        primary: buttonComponents.default,
        secondary: buttonComponents.default,
        outline: buttonComponents.default,
        ghost: buttonComponents.default,
    },
    minimal: {
        default: buttonComponents.minimal,
        primary: buttonComponents.minimal,
        secondary: buttonComponents.minimal,
        outline: buttonComponents.minimal,
        ghost: buttonComponents.minimal,
    },
    acme: {
        default: buttonComponents.acme,
        primary: buttonComponents.acme,
        secondary: buttonComponents.acme,
        outline: buttonComponents.acme,
        ghost: buttonComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Card.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseCardRegistry: Record<ComponentSet, Record<ComponentVariant | "default", CardComponent>> = {
    default: {
        default: cardComponents.default,
    },
    minimal: {
        default: cardComponents.minimal,
    },
    acme: {
        default: cardComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Input.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseInputRegistry: Record<ComponentSet, Record<ComponentVariant | "default", InputComponent>> = {
    default: {
        default: inputComponents.default,
    },
    minimal: {
        default: inputComponents.minimal,
    },
    acme: {
        default: inputComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Select.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseSelectRegistry: Record<ComponentSet, Record<ComponentVariant | "default", SelectComponent>> = {
    default: {
        default: selectComponents.default,
    },
    minimal: {
        default: selectComponents.minimal,
    },
    acme: {
        default: selectComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Textarea.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseTextareaRegistry: Record<ComponentSet, Record<ComponentVariant | "default", TextareaComponent>> = {
    default: {
        default: textareaComponents.default,
    },
    minimal: {
        default: textareaComponents.minimal,
    },
    acme: {
        default: textareaComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Label.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseLabelRegistry: Record<ComponentSet, Record<ComponentVariant | "default", LabelComponent>> = {
    default: {
        default: labelComponents.default,
    },
    minimal: {
        default: labelComponents.minimal,
    },
    acme: {
        default: labelComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Checkbox.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseCheckboxRegistry: Record<ComponentSet, Record<ComponentVariant | "default", CheckboxComponent>> = {
    default: {
        default: checkboxComponents.default,
    },
    minimal: {
        default: checkboxComponents.minimal,
    },
    acme: {
        default: checkboxComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Badge.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseBadgeRegistry: Record<ComponentSet, Record<ComponentVariant | "default", BadgeComponent>> = {
    default: {
        default: badgeComponents.default,
    },
    minimal: {
        default: badgeComponents.minimal,
    },
    acme: {
        default: badgeComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Radio.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseRadioRegistry: Record<ComponentSet, Record<ComponentVariant | "default", RadioComponent>> = {
    default: {
        default: radioComponents.default,
    },
    minimal: {
        default: radioComponents.minimal,
    },
    acme: {
        default: radioComponents.acme,
    },
};

/**
 * Base registry with default componentSet mappings for Topbar.
 * When no tenantOverrideKey is provided, this is used.
 */
const baseTopbarRegistry: Record<ComponentSet, Record<ComponentVariant | "default", TopbarComponent>> = {
    default: {
        default: topbarComponents.default,
    },
    minimal: {
        default: topbarComponents.minimal,
    },
    acme: {
        default: topbarComponents.acme,
    },
};

/**
 * Tenant-specific overrides registry.
 * Populated at runtime when tenant-specific overrides are configured.
 */
const overrideRegistry: ComponentOverrideRegistry = {};

/**
 * Get button component from base registry (no tenant override).
 */
export function getBaseButtonComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): ButtonComponent {
    const setRegistry = baseButtonRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseButtonRegistry.default;
        if (!defaultRegistry) {
            return buttonComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return buttonComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return buttonComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get card component from base registry (no tenant override).
 */
export function getBaseCardComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): CardComponent {
    const setRegistry = baseCardRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseCardRegistry.default;
        if (!defaultRegistry) {
            return cardComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return cardComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return cardComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get button component from tenant override registry.
 */
export function getTenantOverrideButtonComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): ButtonComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const buttonOverrides = tenantOverrides.Button;
    if (!buttonOverrides) {
        return null;
    }
    
    const setOverrides = buttonOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as ButtonComponent;
}

/**
 * Register a tenant-specific button override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantButtonOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: ButtonComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Button) {
        overrideRegistry[tenantOverrideKey]!.Button = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Button![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Button![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Button![componentSet]![variant] = component;
}

/**
 * Get card component from tenant override registry.
 */
export function getTenantOverrideCardComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): CardComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const cardOverrides = tenantOverrides.Card;
    if (!cardOverrides) {
        return null;
    }
    
    const setOverrides = cardOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as CardComponent;
}

/**
 * Register a tenant-specific card override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantCardOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: CardComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Card) {
        overrideRegistry[tenantOverrideKey]!.Card = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Card![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Card![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Card![componentSet]![variant] = component;
}

/**
 * Get input component from base registry (no tenant override).
 */
export function getBaseInputComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): InputComponent {
    const setRegistry = baseInputRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseInputRegistry.default;
        if (!defaultRegistry) {
            return inputComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return inputComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return inputComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get input component from tenant override registry.
 */
export function getTenantOverrideInputComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): InputComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const inputOverrides = tenantOverrides.Input;
    if (!inputOverrides) {
        return null;
    }
    
    const setOverrides = inputOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as InputComponent;
}

/**
 * Register a tenant-specific input override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantInputOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: InputComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Input) {
        overrideRegistry[tenantOverrideKey]!.Input = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Input![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Input![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Input![componentSet]![variant] = component;
}

/**
 * Get select component from base registry (no tenant override).
 */
export function getBaseSelectComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): SelectComponent {
    const setRegistry = baseSelectRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseSelectRegistry.default;
        if (!defaultRegistry) {
            return selectComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return selectComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return selectComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get select component from tenant override registry.
 */
export function getTenantOverrideSelectComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): SelectComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const selectOverrides = tenantOverrides.Select;
    if (!selectOverrides) {
        return null;
    }
    
    const setOverrides = selectOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as SelectComponent;
}

/**
 * Register a tenant-specific select override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantSelectOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: SelectComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Select) {
        overrideRegistry[tenantOverrideKey]!.Select = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Select![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Select![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Select![componentSet]![variant] = component;
}

/**
 * Get textarea component from base registry (no tenant override).
 */
export function getBaseTextareaComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): TextareaComponent {
    const setRegistry = baseTextareaRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseTextareaRegistry.default;
        if (!defaultRegistry) {
            return textareaComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return textareaComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return textareaComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get textarea component from tenant override registry.
 */
export function getTenantOverrideTextareaComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): TextareaComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const textareaOverrides = tenantOverrides.Textarea;
    if (!textareaOverrides) {
        return null;
    }
    
    const setOverrides = textareaOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as TextareaComponent;
}

/**
 * Register a tenant-specific textarea override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantTextareaOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: TextareaComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Textarea) {
        overrideRegistry[tenantOverrideKey]!.Textarea = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Textarea![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Textarea![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Textarea![componentSet]![variant] = component;
}

/**
 * Get label component from base registry (no tenant override).
 */
export function getBaseLabelComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): LabelComponent {
    const setRegistry = baseLabelRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseLabelRegistry.default;
        if (!defaultRegistry) {
            return labelComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return labelComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return labelComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get label component from tenant override registry.
 */
export function getTenantOverrideLabelComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): LabelComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const labelOverrides = tenantOverrides.Label;
    if (!labelOverrides) {
        return null;
    }
    
    const setOverrides = labelOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as LabelComponent;
}

/**
 * Register a tenant-specific label override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantLabelOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: LabelComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Label) {
        overrideRegistry[tenantOverrideKey]!.Label = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Label![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Label![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Label![componentSet]![variant] = component;
}

/**
 * Get checkbox component from base registry (no tenant override).
 */
export function getBaseCheckboxComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): CheckboxComponent {
    const setRegistry = baseCheckboxRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseCheckboxRegistry.default;
        if (!defaultRegistry) {
            return checkboxComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return checkboxComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return checkboxComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get checkbox component from tenant override registry.
 */
export function getTenantOverrideCheckboxComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): CheckboxComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const checkboxOverrides = tenantOverrides.Checkbox;
    if (!checkboxOverrides) {
        return null;
    }
    
    const setOverrides = checkboxOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as CheckboxComponent;
}

/**
 * Register a tenant-specific checkbox override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantCheckboxOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: CheckboxComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Checkbox) {
        overrideRegistry[tenantOverrideKey]!.Checkbox = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Checkbox![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Checkbox![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Checkbox![componentSet]![variant] = component;
}

/**
 * Get badge component from base registry (no tenant override).
 */
export function getBaseBadgeComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): BadgeComponent {
    const setRegistry = baseBadgeRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseBadgeRegistry.default;
        if (!defaultRegistry) {
            return badgeComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return badgeComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return badgeComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get badge component from tenant override registry.
 */
export function getTenantOverrideBadgeComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): BadgeComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const badgeOverrides = tenantOverrides.Badge;
    if (!badgeOverrides) {
        return null;
    }
    
    const setOverrides = badgeOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as BadgeComponent;
}

/**
 * Register a tenant-specific badge override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantBadgeOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: BadgeComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Badge) {
        overrideRegistry[tenantOverrideKey]!.Badge = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Badge![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Badge![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Badge![componentSet]![variant] = component;
}

/**
 * Get radio component from base registry (no tenant override).
 */
export function getBaseRadioComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): RadioComponent {
    const setRegistry = baseRadioRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseRadioRegistry.default;
        if (!defaultRegistry) {
            return radioComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return radioComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return radioComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get radio component from tenant override registry.
 */
export function getTenantOverrideRadioComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): RadioComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const radioOverrides = tenantOverrides.Radio;
    if (!radioOverrides) {
        return null;
    }
    
    const setOverrides = radioOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as RadioComponent;
}

/**
 * Register a tenant-specific radio override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantRadioOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: RadioComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Radio) {
        overrideRegistry[tenantOverrideKey]!.Radio = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Radio![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Radio![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Radio![componentSet]![variant] = component;
}

/**
 * Get topbar component from base registry (no tenant override).
 */
export function getBaseTopbarComponent(
    componentSet: ComponentSet,
    variant?: ComponentVariant
): TopbarComponent {
    const setRegistry = baseTopbarRegistry[componentSet];
    if (!setRegistry) {
        const defaultRegistry = baseTopbarRegistry.default;
        if (!defaultRegistry) {
            return topbarComponents.default;
        }
        const defaultComponent = defaultRegistry.default;
        if (!defaultComponent) {
            return topbarComponents.default;
        }
        return defaultComponent;
    }
    
    const variantKey = variant || "default";
    const variantComponent = setRegistry[variantKey];
    if (variantComponent) {
        return variantComponent;
    }
    const defaultVariantComponent = setRegistry.default;
    if (!defaultVariantComponent) {
        return topbarComponents.default;
    }
    return defaultVariantComponent;
}

/**
 * Get topbar component from tenant override registry.
 */
export function getTenantOverrideTopbarComponent(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant?: ComponentVariant
): TopbarComponent | null {
    const tenantOverrides = overrideRegistry[tenantOverrideKey];
    if (!tenantOverrides) {
        return null;
    }
    
    const topbarOverrides = tenantOverrides.Topbar;
    if (!topbarOverrides) {
        return null;
    }
    
    const setOverrides = topbarOverrides[componentSet];
    if (!setOverrides) {
        return null;
    }
    
    const variantKey = variant || "default";
    const override = setOverrides[variantKey] || setOverrides.default;
    if (!override) {
        return null;
    }
    return override as TopbarComponent;
}

/**
 * Register a tenant-specific topbar override.
 * For future use when tenant-specific overrides are configured.
 */
export function registerTenantTopbarOverride(
    tenantOverrideKey: string,
    componentSet: ComponentSet,
    variant: ComponentVariant,
    component: TopbarComponent
): void {
    if (!overrideRegistry[tenantOverrideKey]) {
        overrideRegistry[tenantOverrideKey] = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Topbar) {
        overrideRegistry[tenantOverrideKey]!.Topbar = {};
    }
    if (!overrideRegistry[tenantOverrideKey]!.Topbar![componentSet]) {
        overrideRegistry[tenantOverrideKey]!.Topbar![componentSet] = {};
    }
    overrideRegistry[tenantOverrideKey]!.Topbar![componentSet]![variant] = component;
}

const g = globalThis as typeof globalThis & { __vendoraButtonOverridesInitialized?: boolean; __vendoraCardOverridesInitialized?: boolean; __vendoraInputOverridesInitialized?: boolean };

/**
 * Initialize tenant-specific Card overrides.
 * Registers demo tenant Card override for all componentSets.
 */
function initializeCardOverrides(): void {
    if (g.__vendoraCardOverridesInitialized) return;
    g.__vendoraCardOverridesInitialized = true;
    
    const tenantOverrideKey = "vendora-sushi-hq";
    
    const overrideMap: Record<ComponentSet, CardComponent> = {
        default: VendoraSushiHqCardDefault,
        minimal: VendoraSushiHqCardMinimal,
        acme: VendoraSushiHqCardAcme,
    };
    
    const componentSets: ComponentSet[] = Object.keys(cardRegistry) as ComponentSet[];
    
    for (const componentSet of componentSets) {
        const override = overrideMap[componentSet] ?? VendoraSushiHqCardDefault;
        registerTenantCardOverride(
            tenantOverrideKey,
            componentSet,
            "default",
            override
        );
    }
}

// Initialize Card overrides at module load time
initializeCardOverrides();

/**
 * Initialize tenant-specific Input overrides.
 * Registers demo tenant Input override for all componentSets.
 */
function initializeInputOverrides(): void {
    if (g.__vendoraInputOverridesInitialized) return;
    g.__vendoraInputOverridesInitialized = true;
    
    const tenantOverrideKey = "vendora-sushi-hq";
    
    const overrideMap: Record<ComponentSet, InputComponent> = {
        default: VendoraSushiHqInputDefault,
        minimal: VendoraSushiHqInputMinimal,
        acme: VendoraSushiHqInputAcme,
    };
    
    const componentSets: ComponentSet[] = Object.keys(inputRegistry) as ComponentSet[];
    
    for (const componentSet of componentSets) {
        const override = overrideMap[componentSet] ?? VendoraSushiHqInputDefault;
        registerTenantInputOverride(
            tenantOverrideKey,
            componentSet,
            "default",
            override
        );
    }
}

// Initialize Input overrides at module load time
initializeInputOverrides();

/**
 * Initialize tenant-specific Button overrides.
 * Registers demo tenant Button override for all componentSets.
 */
function initializeButtonOverrides(): void {
    if (g.__vendoraButtonOverridesInitialized) return;
    g.__vendoraButtonOverridesInitialized = true;
    
    const tenantOverrideKey = "vendora-sushi-hq";
    
    const overrideMap: Record<ComponentSet, ButtonComponent> = {
        default: VendoraSushiHqButtonDefault,
        minimal: VendoraSushiHqButtonMinimal,
        acme: VendoraSushiHqButtonAcme,
    };
    
    const componentSets: ComponentSet[] = Object.keys(buttonRegistry) as ComponentSet[];
    
    for (const componentSet of componentSets) {
        const override = overrideMap[componentSet] ?? VendoraSushiHqButtonDefault;
        registerTenantButtonOverride(
            tenantOverrideKey,
            componentSet,
            "default",
            override
        );
    }
}

// Initialize Button overrides at module load time
initializeButtonOverrides();
