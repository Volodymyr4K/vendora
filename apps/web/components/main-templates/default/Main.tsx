import { SiteTopbar } from "@/components";

export default function DefaultMainTemplate() {
    return (
        <>
            <SiteTopbar />
            <div className="card" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 20 }}>Main</div>
                <div className="muted" style={{ marginTop: 6 }}>
                    Стартова сторінка для single‑branch tenant. Далі її можна кастомізувати під потреби.
                </div>
            </div>
        </>
    );
}
