import type { BadgeProps } from "@/lib/components/badge-base";

export function DefaultBadge({ className, ...props }: BadgeProps) {
    const finalClass = className ? `badge ${className}` : "badge";
    return <span className={finalClass} {...props} />;
}
