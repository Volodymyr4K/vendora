import { forwardRef } from "react";

interface Option {
    value: string;
    label: string | React.ReactNode;
    group?: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    options: Option[];
    label?: string;
    error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ options, label, error, className = "", ...props }, ref) => {
        // Precompute groupsMap: Map<groupName, Option[]>
        const groupsMap = new Map<string, Option[]>();
        for (const opt of options) {
            if (opt.group) {
                const groupName = opt.group;
                if (!groupsMap.has(groupName)) {
                    groupsMap.set(groupName, []);
                }
                groupsMap.get(groupName)!.push(opt);
            }
        }

        // Track which groups have been rendered
        const renderedGroups = new Set<string>();

        return (
            <div className="w-full">
                {label && (
                    <label className="block text-sm font-bold text-muted mb-1.5 ml-1">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {/* Display selected value visually */}
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-base leading-relaxed text-ink">
                        {options.find(opt => opt.value === props.value)?.label || 'Select...'}
                    </div>

                    <select
                        ref={ref}
                        className={`
                            appearance-none w-full px-4 py-3 
                            bg-paper border text-transparent text-base
                            rounded-theme shadow-theme transition-all duration-200 
                            leading-relaxed
                            focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-line
                            disabled:bg-bg disabled:text-muted
                            cursor-pointer hover:border-line
                            ${error ? "border-danger focus:ring-danger/20 focus:border-danger" : "border-line"}
                            ${className}
                        `}
                        {...props}
                    >
                        {options.map((opt) => {
                            if (!opt.group) {
                                return (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                );
                            }
                            if (renderedGroups.has(opt.group)) {
                                return null;
                            }
                            renderedGroups.add(opt.group);
                            const groupOptions = groupsMap.get(opt.group) ?? [];
                            return (
                                <optgroup key={opt.group} label={opt.group}>
                                    {groupOptions.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </optgroup>
                            );
                        })}
                    </select>

                    {/* Custom Chevron Icon */}
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-muted">
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                    </div>
                </div>

                {error && (
                    <p className="mt-1.5 text-xs text-danger font-medium ml-1 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-danger inline-block" />
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

Select.displayName = "Select";
