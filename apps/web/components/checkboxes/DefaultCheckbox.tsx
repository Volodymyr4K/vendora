import type { CheckboxProps } from "@/lib/components/checkbox-base";

export function DefaultCheckbox({ className, ...props }: CheckboxProps) {
    return <input type="checkbox" className={className} {...props} />;
}
