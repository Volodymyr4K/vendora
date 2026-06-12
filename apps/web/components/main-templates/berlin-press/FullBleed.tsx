import type { ReactNode } from "react";
import { berlinPressSans, berlinPressSerif } from "./fonts";

export function AmFullBleed({ children }: { children: ReactNode }) {
    return (
        <div
            className={`berlin-press-lite ${berlinPressSans.variable} ${berlinPressSerif.variable} w-full max-w-full overflow-x-clip md:w-screen md:max-w-[100vw] md:relative md:left-1/2 md:right-1/2 md:-ml-[50vw] md:-mr-[50vw]`}
        >
            {children}
        </div>
    );
}
