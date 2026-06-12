import { describe, expect, test } from "vitest";
import { normalizeMenu } from "../src/services/normalize/menu";
import { normalizeDelivery } from "../src/services/normalize/delivery";
import { normalizeBranches } from "../src/services/normalize/branches";

describe("normalizeBranches", () => {
  test("array branches", () => {
    const raw = [{ id: "kyiv", name: "Київ" }, { slug: "lviv", cityName: "Львів" }];
    const out = normalizeBranches(raw, { unwrapKeys: ["data"] });
    expect(out.length).toBe(2);
    expect(out[0].slug).toBe("kyiv");
  });
});

describe("normalizeMenu", () => {
  test("categories+items", () => {
    const raw = {
      data: {
        categories: [{ id: "pizza", name: "Піцца" }],
        products: [{ sku: "p1", name: "Маргарита", price: "199 грн", categoryId: "pizza", image: "/img/p.png" }],
      },
    };
    const out = normalizeMenu(raw, { baseUrl: "https://example.com", unwrapKeys: ["data"] });
    expect(out.categories[0].slug).toBe("pizza");
    expect(out.items[0].price).toBe(199);
    expect(out.items[0].imageUrl).toMatch(/^https:\/\/example\.com\//);
  });

  test("nested categories", () => {
    const raw = {
      result: {
        categories: [{ name: "Напої", id: "drinks", items: [{ id: "coke", title: "Coca-Cola", cost: 55 }] }],
      },
    };
    const out = normalizeMenu(raw, { baseUrl: "https://example.com", unwrapKeys: ["result"] });
    expect(out.items[0].categorySlug).toBe("drinks");
  });
});

describe("normalizeDelivery", () => {
  test("simple object", () => {
    const raw = { deliveryFee: "60", freeFrom: 500, etaMin: 40, etaMax: 70 };
    const out = normalizeDelivery(raw, { unwrapKeys: ["data"] });
    expect(out.mode).toBe("ok");
    // @ts-ignore
    expect(out.cfg.deliveryFee).toBe(60);
  });
});
