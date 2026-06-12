"use client";

import { useState, useTransition } from "react";
import { requestOtpAction, verifyOtpAction } from "@/app/customer-actions";
import { useRouter, useSearchParams } from "next/navigation";
import { getThemedLabel } from "@/lib/components/label-registry";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedButton } from "@/lib/components/button-registry";
import { useThemeOptional } from "@/lib/theme/client";

interface LoginFormProps {
    tenantSlug: string;
    countryCode: string; // "UA", "US", "DE", etc.
}

const PHONE_RULES: Record<string, { code: string; len: number }> = {
    UA: { code: "+380", len: 9 },
    US: { code: "+1", len: 10 },
    PL: { code: "+48", len: 9 },
    DE: { code: "+49", len: 10 }, // Can vary, but 10 is common mobile
    // Default fallback
    DEFAULT: { code: "+", len: 12 }
};

export function LoginForm({ tenantSlug, countryCode }: LoginFormProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Label = getThemedLabel({ componentSet, tenantOverrideKey: tenantSlug });
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    // REDIRECT LOGIC
    const redirectParam = searchParams.get("redirect");
    const defaultRedirect = tenantSlug ? `/t/${tenantSlug}/profile` : `/profile`;
    const redirectUrl = redirectParam || defaultRedirect;

    const rule = PHONE_RULES[countryCode] ?? PHONE_RULES["UA"] ?? { code: "+380", len: 9 };

    const [step, setStep] = useState<"PHONE" | "OTP">("PHONE");
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    const handleRequestOtp = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (phone.length !== rule.len) {
            setError(`Please enter exactly ${rule.len} digits.`);
            return;
        }

        startTransition(async () => {
            try {
                const fullPhone = `${rule.code}${phone}`;
                await requestOtpAction(fullPhone, tenantSlug);
                setStep("OTP");
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Failed to send code";
                setError(msg);
            }
        });
    };

    const handleVerifyOtp = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
            try {
                const fullPhone = `${rule.code}${phone}`;
                await verifyOtpAction(fullPhone, otp, tenantSlug);
                router.push(redirectUrl);
                router.refresh();
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Invalid code";
                setError(msg);
            }
        });
    };

    return (
        <div className="bg-paper rounded-3xl shadow-2xl overflow-hidden max-w-md w-full border border-line transform hover:scale-[1.01] transition-all duration-300">
            <div className="relative bg-gradient-to-br from-accent via-accent to-accent p-8 text-center overflow-hidden">
                {/* Decorative circles */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-accent-foreground opacity-10 rounded-full -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-accent-foreground opacity-10 rounded-full -ml-16 -mb-16"></div>

                <div className="relative z-10">
                    <div className="w-16 h-16 bg-accent-foreground opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 shadow-theme">
                        <svg className="w-8 h-8 text-accent-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-accent-foreground mb-2">Вітаємо!</h1>
                    <p className="text-accent-foreground opacity-90">Увійдіть в систему для доступу</p>
                </div>
            </div>

            <div className="p-8">
                {error && (
                    <div className="mb-6 p-4 bg-danger-weak text-danger rounded-theme text-sm border-l-4 border-danger animate-shake">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    </div>
                )}

                {step === "PHONE" ? (
                    <form onSubmit={handleRequestOtp} className="space-y-6">
                        <div>
                            <Label className="block text-sm font-medium text-ink mb-2">
                                Phone Number
                            </Label>
                            <div className="relative flex items-center">
                                <span className="absolute left-4 font-mono font-bold text-ink select-none">
                                    {rule.code}
                                </span>
                                <Input
                                    type="tel"
                                    required
                                    placeholder={"X".repeat(rule.len)}
                                    value={phone}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, "").slice(0, rule.len);
                                        setPhone(val);
                                    }}
                                    style={{ paddingLeft: `${rule.code.length * 0.8 + 1.5}rem` }} // Approximate padding dynamic
                                    className="w-full px-4 py-3 rounded-theme border border-line focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all font-mono text-lg"
                                />
                            </div>
                            <p className="text-xs text-muted mt-2">
                                Enter {rule.len} digits. We will send you a verification code.
                            </p>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isPending || phone.length !== rule.len}
                            className="w-full py-3 font-bold flex justify-center items-center"
                        >
                            {isPending ? (
                                <span className="w-5 h-5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
                            ) : (
                                "Continue"
                            )}
                        </Button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp} className="space-y-6">
                        <div>
                            <Label className="block text-sm font-medium text-ink mb-2">
                                Enter Code
                            </Label>
                            <Input
                                type="text"
                                required
                                placeholder="1234"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="w-full px-4 py-3 rounded-theme border border-line focus:ring-2 focus:ring-accent focus:border-accent outline-none text-center text-2xl tracking-widest"
                                autoFocus
                            />
                            <div className="text-center mt-4">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setStep("PHONE")}
                                    className="text-sm text-muted hover:text-danger underline"
                                >
                                    Change phone number ({rule.code} {phone})
                                </Button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isPending || otp.length < 4}
                            className="w-full py-3 font-bold flex justify-center items-center"
                        >
                            {isPending ? (
                                <span className="w-5 h-5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
                            ) : (
                                "Verify & Login"
                            )}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
