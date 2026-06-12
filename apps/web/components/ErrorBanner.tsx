export function ErrorBanner(props: {
  title: string;
  details?: string;
  retryHref?: string;
  contactsHref?: string;
}) {
  return (
    <div className="card border-l-4 border-danger" role="alert">
      <b>{props.title}</b>
      {props.details ? <div className="muted" style={{ marginTop: 6 }}>{props.details}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {props.retryHref ? <a className="btn" href={props.retryHref}>Спробувати ще раз</a> : null}
        {props.contactsHref ? <a className="btn" href={props.contactsHref}>Контакти</a> : null}
      </div>
    </div>
  );
}
