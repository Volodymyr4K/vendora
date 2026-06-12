import { forwardRef } from "react";

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
    className?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
    ({ checked, onChange, label, description, disabled = false, className = "" }, ref) => {
        return (
            <div className={`flex items-start justify-between ${className}`}>
                <div className="flex-1 cursor-pointer select-none">
                    {label && (
                        <label className="text-sm font-medium text-ink">
                            {label}
                        </label>
                    )}
                    {description && (
                        <p className="text-xs text-muted mt-1">
                            {description}
                        </p>
                    )}
                </div>
                <button
                    ref={ref}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => !disabled && onChange(!checked)}
                    className={`
                        relative inline-flex h-6 w-11 items-center rounded-theme
                        transition-all duration-300 ease-in-out
                        focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] focus:ring-offset-2 focus:ring-offset-[var(--paper)]
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${checked
                            ? "bg-[var(--accent)]"
                            : "bg-paper border border-line hover:border-[var(--muted)]"
                        }
                    `}
                >
                    <span
                        className={`
                            inline-block h-4 w-4 transform rounded-theme
                            bg-paper shadow-theme transition-all duration-300
                            ${checked ? "translate-x-6" : "translate-x-1"}
                        `}
                    />
                </button>
            </div>
        );
    }
);

Switch.displayName = "Switch";
