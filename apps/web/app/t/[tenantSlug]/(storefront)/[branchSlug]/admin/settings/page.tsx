"use client";

import { useEffect, useState, useTransition } from "react";
import { getBranchSettingsAction, updateBranchSettingsAction } from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { AccessDeniedBlock } from "../AccessDeniedBlock";
import { BranchSettings, zWorkingSchedule } from "@vendora/contracts";
import { useAdminContext } from "../AdminContext";
import { getThemedButton } from "@/lib/components/button-registry";
import { getThemedCheckbox } from "@/lib/components/checkbox-registry";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedTextarea } from "@/lib/components/textarea-registry";
import { useThemeOptional } from "@/lib/theme/client";

const MODULE_ID = "admin_settings";

export default function AdminSettingsPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
    const { canEdit } = useAdminContext();
    const canEditSettings = canEdit(MODULE_ID);
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const [settings, setSettings] = useState<BranchSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [branchSlug, setBranchSlug] = useState("");
    const [tenantSlug, setTenantSlug] = useState("");
    const [workingScheduleJson, setWorkingScheduleJson] = useState("");
    const [initialWorkingScheduleJson, setInitialWorkingScheduleJson] = useState<string>("");
    const [workingScheduleError, setWorkingScheduleError] = useState("");
    const [isPending, startTransition] = useTransition();
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {
        params.then(p => {
            setBranchSlug(p.branchSlug);
            setTenantSlug(p.tenantSlug);
            load(p.branchSlug, p.tenantSlug);
        });
    }, [params]);

    async function load(slug: string, ts: string) {
        setLoading(true);
        setAccessDenied(false);
        try {
            const data = await getBranchSettingsAction(slug, ts);
            if (data) {
                setSettings(data);
                const scheduleJson = data.workingSchedule
                    ? JSON.stringify(data.workingSchedule, null, 2)
                    : "";
                setWorkingScheduleJson(scheduleJson);
                setInitialWorkingScheduleJson(scheduleJson);
            }
        } catch (e) {
            if (e instanceof Error && e.message === ACCESS_DENIED_MESSAGE) {
                setAccessDenied(true);
            } else {
                console.error(e);
            }
        } finally {
            setLoading(false);
        }
    }

    const handleChange = (field: keyof BranchSettings, value: BranchSettings[keyof BranchSettings]) => {
        if (!settings) return;
        setSettings({ ...settings, [field]: value });
    };

    const handlePhoneChange = (idx: number, val: string) => {
        if (!settings) return;
        const newPhones = [...settings.phones];
        newPhones[idx] = val;
        handleChange("phones", newPhones);
    };

    const addPhone = () => {
        if (!settings) return;
        handleChange("phones", [...settings.phones, ""]);
    };

    const removePhone = (idx: number) => {
        if (!settings) return;
        const newPhones = settings.phones.filter((_, i) => i !== idx);
        handleChange("phones", newPhones);
    };

    const save = () => {
        if (!settings) return;

        const { workingSchedule: _ignored, timezone: _timezoneIgnored, ...rest } = settings;
        void _ignored;
        void _timezoneIgnored;
        let payload: Partial<BranchSettings> = { ...rest };

        if (workingScheduleJson.trim() !== "") {
            try {
                const parsed = JSON.parse(workingScheduleJson);
                const valid = zWorkingSchedule.parse(parsed);
                payload.workingSchedule = valid;
            } catch (e) {
                const message = e instanceof Error ? e.message : "Invalid JSON";
                setWorkingScheduleError(message);
                return;
            }
        }
        setWorkingScheduleError("");

        const WRITE_ERROR_HINT = " Refresh the page if your permissions were changed.";
        startTransition(async () => {
            const res = await updateBranchSettingsAction(branchSlug, payload, tenantSlug);
            if (res) {
                alert("Settings saved!");
                load(branchSlug, tenantSlug);
            } else {
                alert("Failed to save settings." + WRITE_ERROR_HINT);
            }
        });
    };

    if (accessDenied) return <AccessDeniedBlock />;
    if (loading) return <div>Loading settings...</div>;
    if (!settings) return <div>Failed to load settings.</div>;

    const savedHasSchedule = settings?.workingSchedule != null;
    const editorEmpty = workingScheduleJson.trim() === "";

    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
    const Checkbox = getThemedCheckbox({ componentSet, tenantOverrideKey: tenantSlug });
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Textarea = getThemedTextarea({ componentSet, tenantOverrideKey: tenantSlug });

    return (
        <div style={{ maxWidth: 600 }}>
            {!canEditSettings && (
                <div className="bg-warning-weak text-warning" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                    Read-only: you can view settings but not change them.
                </div>
            )}
            <h2>Branch Settings</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 20, opacity: canEditSettings ? 1 : 0.85, pointerEvents: canEditSettings ? "auto" : "none" }}>
                <label>
                    <div style={{ fontWeight: 600, marginBottom: 5 }}>Store Address</div>
                    <Input className="input" value={settings.address || ""} onChange={e => handleChange("address", e.target.value)} placeholder="e.g. 123 Main St" readOnly={!canEditSettings} />
                </label>

                {/* Working Schedule Editor */}
                <label>
                    <div style={{ fontWeight: 600, marginBottom: 5 }}>Weekly workingSchedule (JSON)</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>
                        Format:
                        <pre style={{ margin: "5px 0", background: "var(--paper)", padding: 10, borderRadius: 5, overflowX: "auto" }}>
                            {`{
                            "mon": [{ "start": "09:00", "end": "17:00" }],
                            "tue": [{ "start": "09:00", "end": "17:00" }],
                            "wed": [{ "start": "09:00", "end": "17:00" }],
                            "thu": [{ "start": "09:00", "end": "17:00" }],
                            "fri": [{ "start": "09:00", "end": "17:00" }],
                            "sat": [],
                            "sun": [],
                            "overrides": {
                                "2026-01-01": null,
                                "2026-01-02": [{ "start": "10:00", "end": "14:00" }]
                            }
                            }`}
                        </pre>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, padding: 8, background: "var(--paper)", borderRadius: 4 }}>
                        <div style={{ marginBottom: 4 }}>
                            <strong>Status:</strong> {savedHasSchedule ? "Schedule is set" : "Schedule not set — scheduled/time-slots unavailable"}
                        </div>
                        <div style={{ marginBottom: 4 }}>
                            <strong>Note:</strong> A day with <code>[]</code> means "closed that day"
                        </div>
                        {savedHasSchedule && editorEmpty && (
                            <div className="text-danger" style={{ marginTop: 4, fontWeight: 500 }}>
                                ⚠️ Empty editor does NOT clear DB schedule; Save will keep existing schedule unchanged
                            </div>
                        )}
                    </div>
                    <Textarea
                        className="input"
                        rows={6}
                        value={workingScheduleJson}
                        onChange={e => setWorkingScheduleJson(e.target.value)}
                        style={{ width: "100%", fontFamily: "monospace" }}
                        readOnly={!canEditSettings}
                    />
                    {savedHasSchedule && editorEmpty && (
                        <div style={{ marginTop: 5 }}>
                            <Button
                                type="button"
                                onClick={() => {
                                    setWorkingScheduleJson(initialWorkingScheduleJson);
                                    setWorkingScheduleError("");
                                }}
                                variant="outline"
                                className="bg-success text-accent-foreground"
                                style={{
                                    fontSize: 12,
                                    padding: "4px 8px",
                                    border: "none",
                                    borderRadius: 3,
                                    cursor: "pointer"
                                }}
                            >
                                Restore saved
                            </Button>
                        </div>
                    )}
                    {workingScheduleError && (
                        <div className="text-danger" style={{ fontSize: 12, marginTop: 5 }}>
                            Error: {workingScheduleError}
                        </div>
                    )}
                </label>

                {/* Timezone - Always Inherit from Brand */}
                <label>
                    <div style={{ fontWeight: 600, marginBottom: 5 }}>Timezone</div>
                    <Input
                        className="input"
                        value="🔗 Inherit from Brand"
                        readOnly
                        style={{ width: "100%", opacity: 0.7, cursor: "not-allowed" }}
                    />
                </label>


                <div>
                    <div style={{ fontWeight: 600, marginBottom: 5 }}>Phone Numbers</div>
                    {settings.phones.map((phone, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 5 }}>
                            <Input className="input" value={phone} onChange={e => handlePhoneChange(idx, e.target.value)} placeholder="+380..." readOnly={!canEditSettings} />
                            {canEditSettings && <Button type="button" variant="outline" className="bg-danger" onClick={() => removePhone(idx)}>X</Button>}
                        </div>
                    ))}
                    {canEditSettings && <Button type="button" variant="outline" style={{ fontSize: 12, padding: "4px 8px", background: "var(--line)", color: "var(--ink)" }} onClick={addPhone}>+ Add Phone</Button>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                    <label>
                        <div style={{ fontWeight: 600, marginBottom: 5 }}>Delivery Fee (UAH)</div>
                        <Input className="input" type="number" value={settings.deliveryFee} onChange={e => handleChange("deliveryFee", parseFloat(e.target.value) || 0)} readOnly={!canEditSettings} />
                    </label>
                    <label>
                        <div style={{ fontWeight: 600, marginBottom: 5 }}>Free Delivery From (UAH)</div>
                        <Input className="input" type="number" value={settings.freeFrom} onChange={e => handleChange("freeFrom", parseFloat(e.target.value) || 0)} readOnly={!canEditSettings} />
                    </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                    <label>
                        <div style={{ fontWeight: 600, marginBottom: 5 }}>Min ETA (min)</div>
                        <Input className="input" type="number" value={settings.etaMin} onChange={e => handleChange("etaMin", parseInt(e.target.value) || 0)} readOnly={!canEditSettings} />
                    </label>
                    <label>
                        <div style={{ fontWeight: 600, marginBottom: 5 }}>Max ETA (min)</div>
                        <Input className="input" type="number" value={settings.etaMax} onChange={e => handleChange("etaMax", parseInt(e.target.value) || 0)} readOnly={!canEditSettings} />
                    </label>
                </div>

                {/* Scheduled Orders Section */}
                <div style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 20 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 15, fontSize: 16 }}>⏰ Scheduled Orders</h3>

                    <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15 }}>
                        <Checkbox
                            checked={settings.isScheduledOrderingEnabled ?? true}
                            onChange={e => handleChange("isScheduledOrderingEnabled", e.target.checked)}
                            style={{ width: 20, height: 20 }}
                            disabled={!canEditSettings}
                        />
                        <span style={{ fontWeight: 600 }}>Enable Scheduled Orders</span>
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 15, opacity: settings.isScheduledOrderingEnabled ? 1 : 0.5, pointerEvents: settings.isScheduledOrderingEnabled ? "auto" : "none" }}>
                        <label>
                            <div style={{ fontWeight: 600, marginBottom: 5 }}>Min Advance (min)</div>
                            <Input
                                className="input"
                                type="number"
                                value={settings.minAdvanceMinutes ?? 90}
                                onChange={e => handleChange("minAdvanceMinutes", parseInt(e.target.value) || 0)}
                                readOnly={!canEditSettings}
                            />
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>buffer before delivery</div>
                        </label>
                        <label>
                            <div style={{ fontWeight: 600, marginBottom: 5 }}>Kitchen Prep (min)</div>
                            <Input
                                className="input"
                                type="number"
                                value={settings.prepTimeMinutes ?? 30}
                                onChange={e => handleChange("prepTimeMinutes", parseInt(e.target.value) || 0)}
                                readOnly={!canEditSettings}
                            />
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>for Kitchen Display</div>
                        </label>
                        <label>
                            <div style={{ fontWeight: 600, marginBottom: 5 }}>Max Orders / Slot</div>
                            <Input
                                className="input"
                                type="number"
                                value={settings.slotCapacity ?? 5}
                                onChange={e => handleChange("slotCapacity", parseInt(e.target.value) || 0)}
                                readOnly={!canEditSettings}
                            />
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Capacity limit</div>
                        </label>
                    </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, border: "1px solid var(--line)", padding: 10, borderRadius: 5 }}>
                    <Checkbox checked={settings.isActive} onChange={e => handleChange("isActive", e.target.checked)} style={{ width: 20, height: 20 }} disabled={!canEditSettings} />
                    <span style={{ fontWeight: 600 }}>Branch Active (Accepting Orders)</span>
                </label>

                {canEditSettings && (
                    <div style={{ marginTop: 20 }}>
                        <Button type="button" variant="primary" style={{ width: "100%", padding: 12, fontSize: 16 }} onClick={save} disabled={isPending}>
                            {isPending ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
