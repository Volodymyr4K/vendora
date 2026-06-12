"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onBackToMenu: () => void;
    message?: string;
    tenantSlug?: string;
};

export function AvailabilityConflictModal({ isOpen, onClose, onBackToMenu, message, tenantSlug }: Props) {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: (tenantSlug && tenantSlug.trim() !== "") ? tenantSlug : undefined });

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            portal={true}
            lockScroll={true}
            closeOnEsc={true}
            closeOnBackdrop={false}
            overlayClassName="p-5"
            panelClassName="card bg-paper text-ink border border-line rounded-theme shadow-theme"
            titleId="availability-conflict-modal-title"
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 400,
                }}
            >
                <div 
                    id="availability-conflict-modal-title"
                    className="text-ink" 
                    style={{ fontSize: 18, fontWeight: 950, marginBottom: 12 }}
                >
                    Menu Updated
                </div>
                <p className="text-ink" style={{ marginBottom: 20, lineHeight: 1.5 }}>
                    {message || "Sorry, some items in your cart became unavailable while you were ordering. We have refreshed the menu for you."}
                </p>

                <div style={{ display: "grid", gap: 10 }}>
                    <Button
                        className="btn"
                        onClick={onClose}
                        type="button"
                        variant="primary"
                        style={{ width: "100%", justifyContent: "center" }}
                    >
                        Review Cart
                    </Button>
                    <Button
                        className="btn bg-line text-ink"
                        onClick={onBackToMenu}
                        type="button"
                        variant="outline"
                        style={{
                            width: "100%",
                            justifyContent: "center",
                        }}
                    >
                        Back to Menu
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
