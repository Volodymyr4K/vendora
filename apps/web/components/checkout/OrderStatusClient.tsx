"use client";

import React from "react";
import { fetchClient } from "../../lib/api/fetchClient";
import { z } from "zod";
import { zOrderStatus } from "@vendora/contracts";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";
import { useRoutingContext } from "@/components/RoutingContextProvider";
import { storefrontHref } from "@/lib/routing-helpers";

const ErrorPayloadSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
}).passthrough();

const OrderPayloadItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  quantity: z.number(),
  price: z.number(),
}).passthrough();

const StatusSchema = z.object({
  token: z.string(),
  orderId: z.string(),
  status: zOrderStatus,
  updatedAt: z.string(),
  total: z.number(),
  items: z.array(OrderPayloadItemSchema),
  requestedDeliveryTime: z.string().nullable(),
  message: z.string().optional(),
}).passthrough();

type Status = z.infer<typeof StatusSchema>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const STATUS_LABELS: Record<Status["status"], string> = {
  created: "Створено",
  pending: "В обробці",
  paid: "Оплачено",
  confirmed: "Підтверджено",
  done: "Виконано",
  cancelled: "Скасовано",
};

export function OrderStatusClient(props: { branchSlug: string; token: string; phones: string[]; tenantSlug: string }) {
  const [data, setData] = React.useState<Status | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [polling, setPolling] = React.useState(true);
  const theme = useThemeOptional();
  const routingContext = useRoutingContext();
  const componentSet = theme?.componentSet ?? "default";
  const Button = getThemedButton({ componentSet, tenantOverrideKey: props.tenantSlug });

  const fetchOnce = React.useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchClient(`/api/order/${props.token}`, { cache: "no-store" });
      const json: unknown = await res.json();

      if (!res.ok) {
        const errorPayload = ErrorPayloadSchema.safeParse(json);
        const msg = errorPayload.success
          ? (errorPayload.data.message ?? errorPayload.data.error)
          : undefined;
        throw new Error(msg ?? "STATUS_FAILED");
      }

      const parsed = StatusSchema.safeParse(json);
      if (!parsed.success) {

        throw new Error("STATUS_INVALID_PAYLOAD");
      }

      setData(parsed.data);
      return parsed.data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Не вдалося отримати статус.";
      setErr(msg);
      return null;
    }
  }, [props.token]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      await fetchOnce();
      while (alive && polling) {
        await sleep(60000);
        const st = await fetchOnce();
        if (st && (st.status === "done" || st.status === "cancelled")) {
          // стоп полінг
          setPolling(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [polling, fetchOnce]);

  const phones = props.phones?.length ? props.phones : [];

  return (
    <div className="card bg-paper text-ink border border-line rounded-theme shadow-theme">
      <div style={{ fontWeight: 950, marginBottom: 10 }}>Статус замовлення</div>

      {data ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="row2"><span>Номер</span><b>{data.orderId}</b></div>
          <div className="row2"><span>Статус</span><b>{STATUS_LABELS[data.status]}</b></div>
          {data.requestedDeliveryTime && (
            <div className="row2 bg-[var(--bg)] text-ink border border-line py-1 rounded-theme">
              <span>Доставка на</span>
              <b>{new Date(data.requestedDeliveryTime).toLocaleString('uk-UA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' })}</b>
            </div>
          )}
          <div className="row2"><span>Оновлено</span><b>{new Date(data.updatedAt).toLocaleString()}</b></div>
          {data.message ? <div className="muted text-muted">{data.message}</div> : null}
        </div>
      ) : null}

      {err ? <div className="danger" style={{ marginTop: 10 }}>{err}</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <Button className="btn bg-paper text-ink border border-line" type="button" variant="outline" onClick={fetchOnce}>Оновити</Button>
        <a
          className="btn bg-paper text-ink border border-line"
          href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: props.branchSlug })}
        >
          Каталог
        </a>
        {phones.length ? <a className="btn bg-paper text-ink border border-line" href={`tel:${phones[0]}`}>Подзвонити</a> : null}
      </div>

      <div className="muted text-muted" style={{ marginTop: 12, fontSize: 12.5 }}>
        Сторінка має tokenized URL (без персональних даних). Для SEO — noindex.
      </div>
    </div>
  );
}
