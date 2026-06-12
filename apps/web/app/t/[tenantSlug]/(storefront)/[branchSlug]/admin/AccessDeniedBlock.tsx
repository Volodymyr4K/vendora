"use client";

/** ACCESS_LEVELS Phase 6.2: single i18n source for "no access" block. Shown only on 403 (permission denied). 401 (unauthorized) has a separate flow (login) and must not show this block. */
export const ACCESS_DENIED_TITLE = "Немає доступу до цього розділу.";
export const ACCESS_DENIED_DESCRIPTION = "Бекенд повернув 403. Перевірте права або перейдіть з меню.";

export function AccessDeniedBlock() {
    return (
        <div className="bg-danger-weak text-danger" style={{ padding: 24, borderRadius: 8, maxWidth: 480 }}>
            <strong>{ACCESS_DENIED_TITLE}</strong>
            <p style={{ marginTop: 8, fontSize: 14 }}>{ACCESS_DENIED_DESCRIPTION}</p>
        </div>
    );
}
