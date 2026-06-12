import type { RadioProps } from "@/lib/components/radio-base";

export function DefaultRadio({ className, ...props }: RadioProps) {
    return <input type="radio" className={className} {...props} />;
}
