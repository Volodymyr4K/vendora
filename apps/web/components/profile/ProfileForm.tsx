"use client";

import { useState } from "react";
import { updateCustomerProfileAction } from "@/app/customer-actions";
import { getThemedLabel } from "@/lib/components/label-registry";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedButton } from "@/lib/components/button-registry";
import { useThemeOptional } from "@/lib/theme/client";

interface ProfileFormProps {
    user: {
        name: string | null;
        email: string | null;
        phone: string;
    };
    tenantSlug: string;
}

export function ProfileForm({ user, tenantSlug }: ProfileFormProps) {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const [name, setName] = useState(user.name || "");
    const [email, setEmail] = useState(user.email || "");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");

    const Label = getThemedLabel({ componentSet, tenantOverrideKey: tenantSlug });
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg("");

        try {
            await updateCustomerProfileAction({ name, email }, tenantSlug);
            setMsg("Profile updated successfully!");
        } catch (e) {
            setMsg("Error updating profile");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
                <Label className="block text-sm font-medium text-ink">Phone</Label>
                <Input
                    type="text"
                    value={user.phone}
                    disabled
                    className="mt-1 block w-full px-3 py-2 bg-paper border border-line rounded-theme shadow-theme text-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted mt-1">Phone number cannot be changed.</p>
            </div>

            <div>
                <Label className="block text-sm font-medium text-ink">Name</Label>
                <Input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-line rounded-theme shadow-theme focus:ring-[var(--focus-ring-color)] focus:border-[var(--line)]"
                    placeholder="Your Name"
                />
            </div>

            <div>
                <Label className="block text-sm font-medium text-ink">Email</Label>
                <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-line rounded-theme shadow-theme focus:ring-[var(--focus-ring-color)] focus:border-[var(--line)]"
                    placeholder="email@example.com"
                />
            </div>

            {msg && (
                <div className={`p-2 text-sm rounded ${msg.includes("Error") ? "bg-danger-weak text-danger" : "bg-success-weak text-success"}`}>
                    {msg}
                </div>
            )}

            <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full"
            >
                {loading ? "Saving..." : "Save Changes"}
            </Button>
        </form>
    );
}
