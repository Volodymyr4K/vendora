/**
 * MinimalLayout — compact wrapper for Phase 2.2
 * Minimal padding, no Topbar control
 */
export function MinimalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ padding: "10px" }}>
            {children}
        </div>
    );
}
