/**
 * Component override resolvers.
 * Implements fallback chain: tenant override -> componentSet -> default -> error.
 */

import type { ComponentSet, TenantOverrideKey } from "./types";
import type { ButtonComponent } from "@/lib/components/button-base";
import { getButton } from "@/lib/components/button-base";
import { getTenantOverrideButtonComponent } from "./registry";
import type { CardComponent } from "@/lib/components/card-base";
import { getCard } from "@/lib/components/card-base";
import { getTenantOverrideCardComponent } from "./registry";
import type { InputComponent } from "@/lib/components/input-base";
import { getInput } from "@/lib/components/input-base";
import { getTenantOverrideInputComponent } from "./registry";
import type { SelectComponent } from "@/lib/components/select-base";
import { getSelect } from "@/lib/components/select-base";
import { getTenantOverrideSelectComponent } from "./registry";
import type { TextareaComponent } from "@/lib/components/textarea-base";
import { getTextarea } from "@/lib/components/textarea-base";
import { getTenantOverrideTextareaComponent } from "./registry";
import type { LabelComponent } from "@/lib/components/label-base";
import { getLabel } from "@/lib/components/label-base";
import { getTenantOverrideLabelComponent } from "./registry";
import type { CheckboxComponent } from "@/lib/components/checkbox-base";
import { getCheckbox } from "@/lib/components/checkbox-base";
import { getTenantOverrideCheckboxComponent } from "./registry";
import type { BadgeComponent } from "@/lib/components/badge-base";
import { getBadge } from "@/lib/components/badge-base";
import { getTenantOverrideBadgeComponent } from "./registry";
import type { RadioComponent } from "@/lib/components/radio-base";
import { getRadio } from "@/lib/components/radio-base";
import { getTenantOverrideRadioComponent } from "./registry";
import type { TopbarComponent } from "@/lib/components/topbar-base";
import { getTopbar } from "@/lib/components/topbar-base";
import { getTenantOverrideTopbarComponent } from "./registry";

export interface ResolveButtonComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Button component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getButton)
 * 3. "default" componentSet (via getButton)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getButton(componentSet).
 */
export function resolveButtonComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveButtonComponentParams): ButtonComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideButtonComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getButton)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getButton(componentSet) returns
    const componentSetButton = getButton(componentSet);
    if (componentSetButton) {
        return componentSetButton;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultButton = getButton("default");
    if (defaultButton) {
        return defaultButton;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Button component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveCardComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Card component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getCard)
 * 3. "default" componentSet (via getCard)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getCard(componentSet).
 */
export function resolveCardComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveCardComponentParams): CardComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideCardComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getCard)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getCard(componentSet) returns
    const componentSetCard = getCard(componentSet);
    if (componentSetCard) {
        return componentSetCard;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultCard = getCard("default");
    if (defaultCard) {
        return defaultCard;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Card component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveInputComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Input component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getInput)
 * 3. "default" componentSet (via getInput)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getInput(componentSet).
 */
export function resolveInputComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveInputComponentParams): InputComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideInputComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getInput)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getInput(componentSet) returns
    const componentSetInput = getInput(componentSet);
    if (componentSetInput) {
        return componentSetInput;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultInput = getInput("default");
    if (defaultInput) {
        return defaultInput;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Input component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveSelectComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Select component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getSelect)
 * 3. "default" componentSet (via getSelect)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getSelect(componentSet).
 */
export function resolveSelectComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveSelectComponentParams): SelectComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideSelectComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getSelect)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getSelect(componentSet) returns
    const componentSetSelect = getSelect(componentSet);
    if (componentSetSelect) {
        return componentSetSelect;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultSelect = getSelect("default");
    if (defaultSelect) {
        return defaultSelect;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Select component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveTextareaComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Textarea component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getTextarea)
 * 3. "default" componentSet (via getTextarea)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getTextarea(componentSet).
 */
export function resolveTextareaComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveTextareaComponentParams): TextareaComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideTextareaComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getTextarea)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getTextarea(componentSet) returns
    const componentSetTextarea = getTextarea(componentSet);
    if (componentSetTextarea) {
        return componentSetTextarea;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultTextarea = getTextarea("default");
    if (defaultTextarea) {
        return defaultTextarea;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Textarea component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveLabelComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Label component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getLabel)
 * 3. "default" componentSet (via getLabel)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getLabel(componentSet).
 */
export function resolveLabelComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveLabelComponentParams): LabelComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideLabelComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getLabel)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getLabel(componentSet) returns
    const componentSetLabel = getLabel(componentSet);
    if (componentSetLabel) {
        return componentSetLabel;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultLabel = getLabel("default");
    if (defaultLabel) {
        return defaultLabel;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Label component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveCheckboxComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Checkbox component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getCheckbox)
 * 3. "default" componentSet (via getCheckbox)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getCheckbox(componentSet).
 */
export function resolveCheckboxComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveCheckboxComponentParams): CheckboxComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideCheckboxComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getCheckbox)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getCheckbox(componentSet) returns
    const componentSetCheckbox = getCheckbox(componentSet);
    if (componentSetCheckbox) {
        return componentSetCheckbox;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultCheckbox = getCheckbox("default");
    if (defaultCheckbox) {
        return defaultCheckbox;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Checkbox component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveBadgeComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Badge component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getBadge)
 * 3. "default" componentSet (via getBadge)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getBadge(componentSet).
 */
export function resolveBadgeComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveBadgeComponentParams): BadgeComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideBadgeComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getBadge)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getBadge(componentSet) returns
    const componentSetBadge = getBadge(componentSet);
    if (componentSetBadge) {
        return componentSetBadge;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultBadge = getBadge("default");
    if (defaultBadge) {
        return defaultBadge;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Badge component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveRadioComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Radio component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getRadio)
 * 3. "default" componentSet (via getRadio)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getRadio(componentSet).
 */
export function resolveRadioComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveRadioComponentParams): RadioComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideRadioComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getRadio)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getRadio(componentSet) returns
    const componentSetRadio = getRadio(componentSet);
    if (componentSetRadio) {
        return componentSetRadio;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultRadio = getRadio("default");
    if (defaultRadio) {
        return defaultRadio;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Radio component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}

export interface ResolveTopbarComponentParams {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
}

/**
 * Resolves Topbar component with fallback chain:
 * 1. tenantOverrideKey (if provided and not empty) -> componentSet
 * 2. componentSet (via getTopbar)
 * 3. "default" componentSet (via getTopbar)
 * 4. Throw error if all fallbacks fail
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY
 * the same component as getTopbar(componentSet).
 */
export function resolveTopbarComponent({
    tenantOverrideKey,
    componentSet,
}: ResolveTopbarComponentParams): TopbarComponent {
    // Treat empty string as no override
    const hasTenantOverride = tenantOverrideKey && tenantOverrideKey.trim() !== "";
    
    // Step 1: Try tenant override (if provided)
    if (hasTenantOverride) {
        // Canonicalize: trim whitespace and convert to lowercase
        const canonicalKey = tenantOverrideKey!.trim().toLowerCase();
        const tenantOverride = getTenantOverrideTopbarComponent(
            canonicalKey,
            componentSet
        );
        if (tenantOverride) {
            return tenantOverride;
        }
    }
    
    // Step 2: Fall back to componentSet (via getTopbar)
    // This ensures behavior preservation: when no tenant override,
    // return exactly what getTopbar(componentSet) returns
    const componentSetTopbar = getTopbar(componentSet);
    if (componentSetTopbar) {
        return componentSetTopbar;
    }
    
    // Step 3: Fall back to "default" componentSet
    const defaultTopbar = getTopbar("default");
    if (defaultTopbar) {
        return defaultTopbar;
    }
    
    // Step 4: All fallbacks failed - throw error
    throw new Error(
        `Failed to resolve Topbar component: componentSet="${componentSet}", tenantOverrideKey="${tenantOverrideKey ?? "null"}"`
    );
}
