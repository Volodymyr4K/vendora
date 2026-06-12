import { Header, SiteTopbar } from "@/components";

export default function Privacy() {
  return (
    <>
      <SiteTopbar />
      <Header title="Privacy" subtitle="Privacy & cookies" />
      <div className="card" style={{ lineHeight: 1.55 }}>
        <p>
          We respect your privacy. This page summarizes what data is stored in your browser when you use the website.
        </p>

        <h3 style={{ marginTop: 16, marginBottom: 8, fontWeight: 900 }}>Cookies</h3>
        <p>
          We use a functional cookie to remember your language preference so you don&apos;t have to re-select it on each
          visit.
        </p>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>
            <strong>Name:</strong> <code>am_locale_berlin-press</code>
          </li>
          <li>
            <strong>Purpose:</strong> Stores your selected language (e.g. <code>en</code>/<code>de</code>/<code>ru</code>)
          </li>
          <li>
            <strong>Type:</strong> Functional / strictly necessary
          </li>
          <li>
            <strong>Lifetime:</strong> Up to 1 year
          </li>
        </ul>

        <p style={{ marginTop: 12 }}>
          We do not use advertising or analytics cookies on this website at the moment.
        </p>

        <p style={{ marginTop: 12, opacity: 0.75 }}>
          Last updated: February 21, 2026
        </p>
      </div>
    </>
  );
}
