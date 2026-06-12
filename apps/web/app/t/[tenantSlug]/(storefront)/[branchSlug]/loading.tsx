export default function Loading() {
  return (
    <main style={{ padding: 24 }}>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Loading…</div>
      <div style={{ marginTop: 8, opacity: 0.75 }}>Fetching branch data and catalog.</div>
      <div style={{ marginTop: 14, height: 10, width: 260, borderRadius: 999, background: "var(--line)" }} />
      <div style={{ marginTop: 10, height: 10, width: 340, borderRadius: 999, background: "var(--line)" }} />
    </main>
  );
}
