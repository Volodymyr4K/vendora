import type { LabelProps } from "@/lib/components/label-base";

export function DefaultLabel({ className, ...props }: LabelProps) {
    return <label className={className} {...props} />;
}
