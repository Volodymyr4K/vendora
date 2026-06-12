"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";

export type ModalProps = {
    open: boolean;
    onClose: () => void;

    // behavior toggles (default true)
    closeOnEsc?: boolean;
    closeOnBackdrop?: boolean;
    lockScroll?: boolean;
    portal?: boolean;

    // a11y
    titleId?: string;
    descriptionId?: string;
    role?: "dialog" | "alertdialog";

    // styling hooks
    overlayClassName?: string;
    panelClassName?: string;

    children: React.ReactNode;
};

export function Modal(props: ModalProps): React.JSX.Element | null {
    const {
        open,
        onClose,
        closeOnEsc = true,
        closeOnBackdrop = true,
        lockScroll = true,
        portal = true,
        titleId,
        descriptionId,
        role = "dialog",
        overlayClassName,
        panelClassName,
        children,
    } = props;

    const [mounted, setMounted] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const scrollLockRestoreRef = useRef<string | null>(null);

    // Mount guard for SSR safety
    useEffect(() => {
        setMounted(true);
    }, []);

    // Focus management: store previous focus on open
    useEffect(() => {
        if (open) {
            previousFocusRef.current = document.activeElement as HTMLElement | null;
        }
    }, [open]);

    // Focus trap: find focusable elements
    const getFocusableElements = useCallback((container: HTMLElement): HTMLElement[] => {
        const selector = [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(', ');
        return Array.from(container.querySelectorAll<HTMLElement>(selector));
    }, []);

    // Focus management: focus first focusable element or panel on open
    useEffect(() => {
        if (!open) return;
        const panel = panelRef.current;
        if (!panel) return;

        const focusable = getFocusableElements(panel);
        const first = focusable[0];
        if (first) {
            first.focus();
        } else {
            panel.focus();
        }
    }, [open, getFocusableElements]);

    // Focus trap: handle Tab/Shift+Tab
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!open || !panelRef.current) return;

        if (e.key === 'Tab') {
            const focusable = getFocusableElements(panelRef.current);
            if (focusable.length === 0) {
                e.preventDefault();
                panelRef.current?.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!first || !last) return;

            if (e.shiftKey) {
                // Shift+Tab
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    }, [open, getFocusableElements]);

    // ESC key handler
    useEffect(() => {
        if (!open || !closeOnEsc) return;

        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('keydown', handleEsc);
        };
    }, [open, closeOnEsc, onClose]);

    // Focus trap: attach keydown listener
    useEffect(() => {
        if (!open) return;
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, handleKeyDown]);

    // Scroll lock
    useEffect(() => {
        if (!open || !lockScroll) return;

        const previousOverflow = document.body.style.overflow;
        scrollLockRestoreRef.current = previousOverflow || '';
        document.body.style.overflow = 'hidden';

        return () => {
            if (scrollLockRestoreRef.current !== null) {
                document.body.style.overflow = scrollLockRestoreRef.current;
            } else {
                document.body.style.overflow = '';
            }
        };
    }, [open, lockScroll]);

    // Restore focus on close
    useEffect(() => {
        if (!open) {
            const prev = previousFocusRef.current;
            if (prev && document.contains(prev)) {
                prev.focus();
            }
            previousFocusRef.current = null;
        }
    }, [open]);

    // Backdrop click handler
    const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
            onClose();
        }
    }, [closeOnBackdrop, onClose]);

    if (!open) {
        return null;
    }

    // If portal is enabled but not mounted yet, return null to avoid SSR/client mismatch
    if (portal && !mounted) {
        return null;
    }

    const overlayClasses = [
        'fixed inset-0 flex items-center justify-center',
        'z-[9999]',
        'bg-[var(--surface-scrim)]',
        overlayClassName || '',
    ].filter(Boolean).join(' ');

    const panelClasses = [
        'bg-paper text-ink rounded-theme',
        'max-w-[95vw] max-h-[90vh] overflow-auto',
        'shadow-lg',
        panelClassName || '',
    ].filter(Boolean).join(' ');

    const ariaProps: React.HTMLAttributes<HTMLDivElement> = {
        role,
        'aria-modal': 'true',
    };
    if (titleId) {
        ariaProps['aria-labelledby'] = titleId;
    }
    if (descriptionId) {
        ariaProps['aria-describedby'] = descriptionId;
    }

    const content = (
        <div
            className={overlayClasses}
            onClick={handleOverlayClick}
        >
            <div
                ref={panelRef}
                className={panelClasses}
                tabIndex={-1}
                {...ariaProps}
            >
                {children}
            </div>
        </div>
    );

    if (portal && mounted && typeof document !== 'undefined') {
        return createPortal(content, document.body);
    }

    return content;
}
