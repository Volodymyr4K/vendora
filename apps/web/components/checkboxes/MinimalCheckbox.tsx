import type { CheckboxProps } from "@/lib/components/checkbox-base";

export function MinimalCheckbox({ className, ...props }: CheckboxProps) {
    return <input type="checkbox" className={className} {...props} />;
}
