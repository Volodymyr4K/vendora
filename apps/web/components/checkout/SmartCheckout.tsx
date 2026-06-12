"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
// import { useRouter } from "next/navigation";
import { useCart } from "../cart/CartProvider";
import { formatPrice } from "@/lib/format";
import { checkoutInitAction, checkoutConfirmAction, getTimeSlotsAction } from "@/app/checkout/actions";
import { quoteCheckout } from "@/lib/api/checkout";
import { logger } from "@/lib/logger";
// import { AvailabilityConflictModal } from "./AvailabilityConflictModal"; // Unused
import type { QuoteResponse, TimeSlot } from "@vendora/contracts";

import { getThemedButton } from "@/lib/components/button-registry";
import { getThemedCard } from "@/lib/components/card-registry";
import { getThemedCheckbox } from "@/lib/components/checkbox-registry";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedLabel } from "@/lib/components/label-registry";
import { getThemedSelect } from "@/lib/components/select-registry";
import { getThemedTextarea } from "@/lib/components/textarea-registry";
import { useThemeOptional } from "@/lib/theme/client";
import { Modal } from "@/components/ui/Modal";

interface Address {
    id: string;
    city: string;
    street: string;
    house: string;
    flat?: string;
    label?: string;
}

interface SmartCheckoutProps {
    branchSlug: string;
    tenantSlug: string;
    cityName: string;
    phones: string[];
    initialAddresses: Address[]; // From Server
    isAuthenticated: boolean;
    showTimeSlots?: boolean; // Phase 9: Control time slot visibility via scheduledOrdering flag
}

export function SmartCheckout({ branchSlug, tenantSlug, initialAddresses, isAuthenticated, showTimeSlots = true }: SmartCheckoutProps) {
    const cart = useCart();
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";

    // STAGE: 'form' | 'otp' | 'success'
    const [stage, setStage] = useState<"form" | "otp" | "success">("form");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // DATA
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [addresses] = useState<Address[]>(initialAddresses);

    // SELECTION
    // If we have addresses, default to first (Home?) or null
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
        initialAddresses.length > 0 ? initialAddresses[0]?.id || null : null
    );

    // NEW ADDRESS FORM (if selectedAddressId === 'new')
    const [showNewAddress, setShowNewAddress] = useState(initialAddresses.length === 0);
    const [newAddr, setNewAddr] = useState({ city: "", street: "", house: "", flat: "", label: "Home" });
    const [saveAddr, setSaveAddr] = useState(false);

    // EXTRA FIELDS
    const [payment, setPayment] = useState<"cash" | "card_on_delivery" | "online">("cash");
    const [personCount, setPersonCount] = useState(1);
    const [comment, setComment] = useState("");
    const [deliveryTime, setDeliveryTime] = useState<string>(""); // ISO or empty (ASAP)

    // OTP
    const [otp, setOtp] = useState("");
    const [, setOtpTtl] = useState(300);

    // SCHEDULED ORDERS
    const [deliveryType, setDeliveryType] = useState<"asap" | "scheduled">("asap");
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [timeSlotsError, setTimeSlotsError] = useState<string | null>(null);
    const [isScheduledOrderingEnabled, setIsScheduledOrderingEnabled] = useState(false);

    // QUOTE STATE
    const [quote, setQuote] = useState<QuoteResponse | null>(null);

    // FETCH SLOTS
    useEffect(() => {
        if (!branchSlug) return;

        let cancelled = false;

        const fetchSlots = async () => {
            setLoadingSlots(true);
            setTimeSlotsError(null);
            try {
                const data = await getTimeSlotsAction(branchSlug, tenantSlug);
                if (!cancelled && data) {
                    setIsScheduledOrderingEnabled(data.isScheduledOrderingEnabled);
                    if (!data.isScheduledOrderingEnabled) {
                        setDeliveryType('asap');
                    }
                    if (data.slots) {
                        setSlots(data.slots);
                    }
                }
            } catch (err) {
                logger.error("Failed to load time slots", err);
                if (!cancelled) {
                    // Start with empty slots on error (matches fallback behavior)
                    setSlots([]);
                    setTimeSlotsError("Слоти для планування замовлення тимчасово недоступні. Спробуйте пізніше.");
                    setIsScheduledOrderingEnabled(true);
                }
            } finally {
                if (!cancelled) {
                    setLoadingSlots(false);
                }
            }
        };

        fetchSlots();

        return () => {
            cancelled = true;
        };
    }, [branchSlug, tenantSlug]);

    // HANDLERS for Scheduled Orders
    const handleDeliveryTypeChange = (type: "asap" | "scheduled") => {
        setDeliveryType(type);
        if (type === "asap") {
            setDeliveryTime("");
        } else {
            // Auto-select first slot if not selected (User Tip #1)
            if (!deliveryTime && slots.length > 0) {
                setDeliveryTime(slots[0]?.value || "");
            }
        }
    };

    // REFRESH QUOTE
    useEffect(() => {
        if (!cart.items.length) return;

        const fetchQuote = async () => {
            try {
                const data = await quoteCheckout({
                    branchSlug,
                    items: cart.items.map(x => ({ id: x.id, qty: x.qty }))
                });
                setQuote(data);
            } catch (e) {
                logger.error("Quote fetch error", e);
            }
        };
        fetchQuote();
    }, [cart.items, branchSlug]);

    // UI HANDLERS

    const handleAddressSelect = (id: string) => {
        if (id === 'new') {
            setSelectedAddressId(null);
            setShowNewAddress(true);
        } else {
            setSelectedAddressId(id);
            setShowNewAddress(false);
        }
    };

    const cleanPhone = (p: string) => p.replace(/\D/g, "").slice(0, 9); // After +380

    const canSubmit = cart.items.length > 0 && phone.length === 9 && (
        (selectedAddressId) ||
        (showNewAddress && newAddr.street && newAddr.house && newAddr.city)
    );

    // IDEMPOTENCY
    const idempotencyKey = useRef(crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

    // ACTIONS
    const onInit = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const deliveryPayload = showNewAddress
                ? { method: "delivery" as const, newAddress: newAddr }
                : { method: "delivery" as const, addressId: selectedAddressId! };

            const res = await checkoutInitAction({
                branchSlug,
                items: cart.items.map(x => ({ id: x.id, qty: x.qty })),
                customer: { name: name || undefined, phone: `+380${phone}` },
                delivery: deliveryPayload,
                payment: { method: payment },
                saveToAddressBook: saveAddr,
                personCount,
                comment: comment || undefined,
                requestedDeliveryTime: deliveryTime || undefined
            });

            if (res.ok) {
                if (res.data.success) {
                    setOtpTtl(res.data.ttl);
                    setStage("otp");
                    // Auto focus OTP input?
                }
            } else {
                setError(res.error.message || res.error.code || "Unknown Error");
            }
        } catch (e: unknown) {
            logger.error("Checkout Init Error", e);
            setError(e instanceof Error ? e.message : 'Checkout Init Failed');
        } finally {
            setLoading(false);
        }
    }, [branchSlug, cart.items, name, phone, showNewAddress, newAddr, selectedAddressId, payment, saveAddr, personCount, comment, deliveryTime]);

    const onConfirm = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await checkoutConfirmAction({
                phone: `+380${phone}`,
                otp
            }, idempotencyKey.current); // Pass strict key

            if (res.success) {
                cart.clear();
                setStage("success");
                // Redirect
                window.location.href = `/${branchSlug}/order/${res.token}`;
            }
        } catch (e: unknown) {
            logger.error("Checkout Confirm Error", e);
            setError(e instanceof Error ? e.message : 'Confirmation Failed');
            setOtp(""); // Clear OTP on error
        } finally {
            setLoading(false);
        }
    }, [branchSlug, cart, phone, otp]);

    // Auto-submit OTP
    useEffect(() => {
        if (stage === 'otp' && otp.length === 4) {
            onConfirm();
        }
    }, [stage, otp, onConfirm]);

    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
    const Card = getThemedCard({ componentSet, tenantOverrideKey: tenantSlug });
    const Checkbox = getThemedCheckbox({ componentSet, tenantOverrideKey: tenantSlug });
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Label = getThemedLabel({ componentSet, tenantOverrideKey: tenantSlug });
    const Select = getThemedSelect({ componentSet, tenantOverrideKey: tenantSlug });
    const Textarea = getThemedTextarea({ componentSet, tenantOverrideKey: tenantSlug });

    // RENDER
    if (stage === 'otp') {
        return (
            <Modal
                open={stage === 'otp'}
                onClose={() => setStage('form')}
                closeOnEsc={true}
                closeOnBackdrop={false}
                lockScroll={true}
                portal={true}
                overlayClassName="p-4"
                panelClassName="p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95"
                titleId="otp-modal-title"
            >
                <h3 id="otp-modal-title" className="text-xl font-bold mb-2">Підтвердження</h3>
                <p className="text-muted mb-6">Ми відправили код на +380 {phone}</p>

                <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full text-center text-3xl tracking-[1em] font-mono border-b-2 border-line focus:border-[var(--line)] outline-none py-2 mb-8 bg-transparent"
                    autoFocus
                />

                {error && <div className="text-danger text-center mb-4 text-sm">{error}</div>}

                <Button
                    variant="primary"
                    onClick={onConfirm}
                    disabled={loading || otp.length !== 4}
                    className="w-full py-3"
                >
                    {loading ? "Перевірка..." : "Підтвердити"}
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setStage('form')}
                    className="w-full py-3 mt-2 text-muted hover:text-ink"
                >
                    Назад
                </Button>
            </Modal>
        );
    }

    return (
        <div className="space-y-6">
            {/* HEADER */}
            {error && <div className="p-4 bg-danger-weak text-danger rounded-theme">{error}</div>}

            {/* ITEMS */}
            <Card className="p-4 rounded-theme">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-lg">Кошик</h2>
                    <Button variant="ghost" onClick={() => cart.clear()} className="text-sm text-muted hover:text-danger">Очистити</Button>
                </div>
                {!cart.items.length ? (
                    <div className="text-muted py-4 text-center">Кошик порожній</div>
                ) : (
                    <div className="space-y-3">
                        {cart.items.map(it => (
                            <div key={it.id} className="flex justify-between items-start">
                                <div>
                                    <div className="font-medium">{it.title}</div>
                                    <div className="text-xs text-muted">{formatPrice(it.priceSnapshot, true)} грн</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" className="w-6 h-6 bg-[var(--line)] rounded-theme flex items-center justify-center" onClick={() => cart.setQty(it.id, Math.max(1, it.qty - 1))}>-</Button>
                                    <span className="w-4 text-center text-sm">{it.qty}</span>
                                    <Button type="button" variant="outline" className="w-6 h-6 bg-[var(--line)] rounded-theme flex items-center justify-center" onClick={() => cart.setQty(it.id, it.qty + 1)}>+</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* DETAILS FORM */}
            <Card className="p-4 rounded-theme space-y-4">
                <h2 className="font-bold text-lg">Деталі</h2>

                {/* PHONE & NAME */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label className="block text-xs font-medium text-muted mb-1">Телефон</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-ink font-mono">+380</span>
                            <Input
                                className="w-full pl-14 pr-3 font-mono"
                                value={phone}
                                onChange={e => setPhone(cleanPhone(e.target.value))}
                                placeholder="XX XXX XX XX"
                            />
                        </div>
                    </div>
                    <div>
                        <Label className="block text-xs font-medium text-muted mb-1">Ім'я (опційно)</Label>
                        <Input
                            className="w-full p-2"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Як до вас звертатись?"
                        />
                    </div>
                </div>

                {/* PERSON COUNT */}
                <div>
                    <Label className="block text-xs font-medium text-muted mb-1">Кількість приборів</Label>
                    <div className="flex items-center gap-4">
                        <Button type="button" variant="outline" className="w-10 h-10 bg-[var(--line)] rounded-theme text-lg font-bold" onClick={() => setPersonCount(Math.max(1, personCount - 1))}>-</Button>
                        <span className="text-xl font-bold w-8 text-center">{personCount}</span>
                        <Button type="button" variant="outline" className="w-10 h-10 bg-[var(--line)] rounded-theme text-lg font-bold" onClick={() => setPersonCount(personCount + 1)}>+</Button>
                    </div>
                </div>

                {/* ADDRESS SELECTOR */}
                <div>
                    <Label className="block text-xs font-medium text-muted mb-1">Адреса доставки</Label>

                    {addresses.length > 0 && (
                        <div className="space-y-2 mb-3">
                            {addresses.map(addr => (
                                <div
                                    key={addr.id}
                                    onClick={() => handleAddressSelect(addr.id)}
                                    className={`p-3 rounded-theme border cursor-pointer transition-all ${selectedAddressId === addr.id
                                        ? "bg-ink text-paper border-line"
                                        : "bg-paper border-line hover:border-[var(--muted)]"
                                        }`}
                                >
                                    <div className="font-bold text-sm">{addr.label || "Address"}</div>
                                    <div className={`text-xs ${selectedAddressId === addr.id ? 'text-ink' : 'text-muted'}`}>
                                        {addr.city}, {addr.street} {addr.house} {addr.flat ? `, кв. ${addr.flat}` : ''}
                                    </div>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                onClick={() => handleAddressSelect('new')}
                                className={`w-full p-2 text-sm font-medium rounded-theme border-dashed ${showNewAddress ? 'bg-[var(--bg)]' : ''}`}
                            >
                                + Нова адреса
                            </Button>
                        </div>
                    )}

                    {(showNewAddress || addresses.length === 0) && (
                        <div className="bg-[var(--bg)] p-4 rounded-theme border border-line animate-in fade-in space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <Input placeholder="Місто" value={newAddr.city} onChange={e => setNewAddr({ ...newAddr, city: e.target.value })} className="p-2 w-full" />
                                <Input placeholder="Вулиця" value={newAddr.street} onChange={e => setNewAddr({ ...newAddr, street: e.target.value })} className="p-2 w-full" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <Input placeholder="Буд." value={newAddr.house} onChange={e => setNewAddr({ ...newAddr, house: e.target.value })} className="p-2 w-full" />
                                <Input placeholder="Кв./Оф." value={newAddr.flat} onChange={e => setNewAddr({ ...newAddr, flat: e.target.value })} className="p-2 w-full" />
                                <Input placeholder="Назва (Дім)" value={newAddr.label} onChange={e => setNewAddr({ ...newAddr, label: e.target.value })} className="p-2 w-full" />
                            </div>
                            {isAuthenticated && addresses.length < 5 && (
                                <Label className="flex items-center gap-2 text-sm text-muted">
                                    <Checkbox checked={saveAddr} onChange={e => setSaveAddr(e.target.checked)} />
                                    Зберегти в мої адреси
                                </Label>
                            )}
                        </div>
                    )}
                </div>



                {/* DELIVERY TIME - Only show if scheduledOrdering feature is enabled */}
                {showTimeSlots && isScheduledOrderingEnabled && (
                    <div>
                        <Label className="block text-xs font-medium text-muted mb-1">Час доставки</Label>
                        <div className="flex gap-2 mb-2 p-1 bg-[var(--line)] rounded-theme">
                            <Button
                                variant={deliveryType === 'asap' ? 'primary' : 'secondary'}
                                onClick={() => handleDeliveryTypeChange('asap')}
                                className="flex-1 py-2 text-sm font-medium rounded-theme transition-all"
                            >
                                Якнайшвидше
                            </Button>
                            <Button
                                variant={deliveryType === 'scheduled' ? 'primary' : 'secondary'}
                                onClick={() => handleDeliveryTypeChange('scheduled')}
                                className="flex-1 py-2 text-sm font-medium rounded-theme transition-all"
                            >
                                На час
                            </Button>
                        </div>

                        {deliveryType === 'scheduled' && (
                            <div className="animate-in slide-in-from-top-2 fade-in">
                                {loadingSlots ? (
                                    <div className="text-sm text-muted p-2 text-center bg-[var(--bg)] rounded-theme">Завантаження слотів...</div>
                                ) : timeSlotsError ? (
                                    <div className="text-sm text-danger p-3 bg-danger-weak rounded-theme border border-danger">
                                        {timeSlotsError}
                                    </div>
                                ) : slots.length === 0 ? (
                                    <div className="text-sm text-danger p-3 bg-danger-weak rounded-theme border border-danger">
                                        На жаль, на сьогодні/завтра немає доступних слотів.
                                    </div>
                                ) : (
                                    <Select
                                        value={deliveryTime}
                                        onChange={e => setDeliveryTime(e.target.value)}
                                        options={[
                                            ...(!deliveryTime ? [{ value: "", label: "Оберіть час..." }] : []),
                                            ...slots.map(s => ({
                                                value: s.value,
                                                label: s.label,
                                                group: s.label.split(' ')[0] || "Інше"
                                            }))
                                        ]}
                                        className="w-full bg-paper border border-line rounded-theme py-3 px-3 text-sm focus:outline-none focus:border-[var(--line)] focus:ring-0 appearance-none"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* COMMENT */}
                <div>
                    <Label className="block text-xs font-medium text-muted mb-1">Коментар до замовлення</Label>
                    <Textarea
                        rows={2}
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Код домофону, прохання до кур'єра..."
                    />
                </div>

                {/* PAYMENT */}
                <div>
                    <Label className="block text-xs font-medium text-muted mb-1">Оплата</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            onClick={() => setPayment('cash')}
                            variant={payment === 'cash' ? 'primary' : 'secondary'}
                            className="p-3 text-sm font-medium"
                        >
                            Готівка
                        </Button>
                        <Button
                            onClick={() => setPayment('card_on_delivery')}
                            variant={payment === 'card_on_delivery' ? 'primary' : 'secondary'}
                            className="p-3 text-sm font-medium"
                        >
                            Картка (термінал)
                        </Button>
                        {/* Online disabled for MVP Phase 4 */}
                    </div>
                </div>

            </Card>

            {/* SUMMARY & SUBMIT */}
            <Card className="p-4 rounded-theme">
                {quote ? (
                    <div className="space-y-2 mb-4 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted">Вартість продуктів</span>
                            <span className="font-medium">{formatPrice(quote.subtotal, true)} грн</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted">Доставка</span>
                            <span className="font-medium">{quote.deliveryFee === 0 ? "Безкоштовно" : `${formatPrice(quote.deliveryFee, true)} грн`}</span>
                        </div>
                        <div className="border-t pt-2 mt-2 flex justify-between text-lg font-bold">
                            <span>Разом</span>
                            <span>{formatPrice(quote.total, true)} грн</span>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-4 text-muted text-sm">Рахуємо вартість...</div>
                )}

                <Button
                    onClick={onInit}
                    disabled={!canSubmit || loading}
                    className="w-full py-4 text-lg"
                    variant="primary"
                >
                    {loading ? "Обробка..." : "Замовити"}
                </Button>
            </Card>
        </div >
    );
}
