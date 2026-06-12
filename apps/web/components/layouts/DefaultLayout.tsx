/**
 * DefaultLayout — standard spacing wrapper for Phase 2.2
 * No Topbar control (Topbar stays in parent layout.tsx)
 */
export function DefaultLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
            {children}
        </div>
    );
}
