export function Header(props: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="card" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: "-.4px" }}>{props.title}</div>
        {props.subtitle ? <div className="muted" style={{ marginTop: 6 }}>{props.subtitle}</div> : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
        {props.right}
      </div>
    </header>
  );
}
