"use client";

import React from "react";
import type { MenuResponse as TMenu } from "@vendora/contracts";
import { AddToCartButton } from "../cart/AddToCartButton";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedButton } from "@/lib/components/button-registry";
import { useRoutingContext } from "@/components/RoutingContextProvider";
import { storefrontHref } from "@/lib/routing-helpers";

type Props = {
  branchSlug: string;
  menu: TMenu;
  initialCategory?: string;
  tenantSlug?: string;
};

function norm(s: string) {
  return s.toLowerCase().trim();
}

import { formatPrice } from "@/lib/format";

export function MenuClient(props: Props) {
  const { branchSlug, menu, tenantSlug } = props;
  const theme = useThemeOptional();
  const routingContext = useRoutingContext();
  const componentSet = theme?.componentSet ?? "default";
  const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
  const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
  const [activeId, setActiveId] = React.useState(
    menu.categories.find(c => c.slug === props.initialCategory)?.id || menu.categories[0]?.id || ""
  );
  const [q, setQ] = React.useState("");

  const cats = menu.categories;
  const qn = norm(q);

  const items = React.useMemo(() => {
    let list = menu.items;

    // Filter by Category ID
    if (activeId) {
      list = list.filter((x) => x.categoryId === activeId || x.categorySlug === activeId);
      // Fallback to slug match if id missing? 
      // No, we killed mocks. x.categoryId should be present. 
      // But wait, x.categorySlug might be useful for legacy URLs? 
      // The request demanded: "Update the filtering logic... to use product.categoryId === category.id".
      // So strictly ID match.
      list = list.filter((x) => x.categoryId === activeId);
    }

    if (qn) {
      list = list.filter((x) => {
        const hay = `${x.title} ${x.desc || ""} ${(x.tags || []).join(" ")}`;
        return norm(hay).includes(qn);
      });
    }
    return list;
  }, [menu, activeId, qn]);

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="row">
          <div>
            <div style={{ fontWeight: 950, letterSpacing: "-.3px", fontSize: 18 }}>Каталог</div>
            <div className="muted" style={{ fontWeight: 800, marginTop: 4 }}>Пошук, категорії, карточки товарів, кошик.</div>
          </div>
          <a
            className="btn"
            href={storefrontHref(routingContext, "/checkout", { explicitBranchSlug: branchSlug })}
          >
            Перейти до checkout
          </a>
        </div>

        <Input
          className="input"
          placeholder="Пошук по каталогу (наприклад: філадельфія, сет, гостре...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {cats.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant={c.id === activeId ? "primary" : "secondary"}
              className="btn"
              onClick={() => setActiveId(c.id)}
              aria-pressed={c.id === activeId}
            >
              {c.title}
            </Button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="grid3">
          {items.map((it) => (
            <div key={it.id} className="card product">
              <a
                className="link"
                href={storefrontHref(routingContext, `/p/${it.id}`, { explicitBranchSlug: branchSlug })}
                style={{ textDecoration: "none" }}
              >
                <img className="productImg" src={it.imageUrl || "/demo/sets/classic.svg"} alt={it.imageAlt || it.title} />
              </a>
              <div>
                <a
                  className="link"
                  href={storefrontHref(routingContext, `/p/${it.id}`, { explicitBranchSlug: branchSlug })}
                  style={{ textDecoration: "none" }}
                >
                  <p className="productTitle">{it.title}</p>
                </a>
                {it.desc ? <p className="productDesc">{it.desc}</p> : null}
                <div className="tagRow" style={{ marginTop: 8 }}>
                  {it.weightG ? <span className="tag">{it.weightG} г</span> : null}
                  {(it.tags || []).slice(0, 3).map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                  {it.isAvailable === false ? <span className="tag">немає</span> : null}
                </div>
              </div>
              <div className="priceRow">
                <div>
                  <span className="price">{formatPrice(it.price, true)} грн</span>
                  {it.oldPrice ? <span className="priceOld">{formatPrice(it.oldPrice, true)} грн</span> : null}
                </div>
                <AddToCartButton id={it.id} title={it.title} price={it.price} tenantSlug={tenantSlug} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
