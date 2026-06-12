import type { LabelProps } from "@/lib/components/label-base";

export function MinimalLabel({ className, ...props }: LabelProps) {
    return <label className={className} {...props} />;
}
