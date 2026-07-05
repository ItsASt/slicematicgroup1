import { describe, it, expect } from "vitest";
import { buildOrder, OrderPayload } from "@/lib/orders";
import type { Menu } from "@/lib/types";

const menu: Menu = {
  bases: [{ id: "B1", name: "Thin Crust", price: 149 }],
  pizzas: [{ id: "P1", name: "Margherita", price: 299 }],
  toppings: [
    { id: "T9", name: "Extra Cheese", price: 69 },
    { id: "T3", name: "Black Olives", price: 49 },
  ],
  beverages: [
    { id: "D1", name: "Cola", price: 59 },
    { id: "D6", name: "Cold Coffee", price: 129 },
  ],
};

const valid: OrderPayload = {
  customerName: "Rajan Sharma",
  phone: "9876543210",
  tableId: "12",
  baseId: "B1",
  pizzaId: "P1",
  toppingIds: ["T9"],
  quantity: 5,
  paymentMode: "upi",
};

describe("buildOrder", () => {
  it("builds a correct order with discount and GST from DB prices", () => {
    const result = buildOrder(valid, menu);
    if (!result.ok) throw new Error(result.error);
    expect(result.order.subtotal).toBe(2585); // 517 * 5
    expect(result.order.discount).toBe(258.5);
    expect(result.order.gst).toBe(418.77);
    expect(result.order.total).toBe(2745.27);
    expect(result.order.payment_mode).toBe("upi");
    expect(result.items).toHaveLength(3); // base + pizza + 1 topping
    expect(result.items[0]).toEqual({
      item_type: "base",
      item_id: "B1",
      item_name: "Thin Crust",
      unit_price: 149,
      quantity: 5,
    });
  });

  it("trims the customer name before storing", () => {
    const result = buildOrder({ ...valid, customerName: "  Rajan Sharma  " }, menu);
    if (!result.ok) throw new Error(result.error);
    expect(result.order.customer_name).toBe("Rajan Sharma");
  });

  it("rejects invalid name, phone, quantity, payment mode, table", () => {
    expect(buildOrder({ ...valid, customerName: "   " }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, phone: "1234567890" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, quantity: 11 }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, quantity: 2.5 }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, paymentMode: "bitcoin" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, tableId: "" }, menu).ok).toBe(false);
  });

  it("rejects unknown item ids (client cannot invent items or prices)", () => {
    expect(buildOrder({ ...valid, baseId: "B99" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, pizzaId: "P99" }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, toppingIds: ["T99"] }, menu).ok).toBe(false);
  });

  it("rejects duplicate topping ids", () => {
    expect(buildOrder({ ...valid, toppingIds: ["T9", "T9"] }, menu).ok).toBe(false);
  });

  it("adds beverages once each, not multiplied by pizza quantity", () => {
    const result = buildOrder({ ...valid, beverageIds: ["D1", "D6"] }, menu);
    if (!result.ok) throw new Error(result.error);
    // pizzas: 517 * 5 = 2585; drinks: 59 + 129 = 188; subtotal 2773
    expect(result.order.subtotal).toBe(2773);
    expect(result.order.discount).toBe(277.3);
    const beverageRows = result.items.filter((i) => i.item_type === "beverage");
    expect(beverageRows).toHaveLength(2);
    expect(beverageRows.every((i) => i.quantity === 1)).toBe(true);
  });

  it("rejects unknown or duplicate beverage ids", () => {
    expect(buildOrder({ ...valid, beverageIds: ["D99"] }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, beverageIds: ["D1", "D1"] }, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, beverageIds: "D1" as unknown as string[] }, menu).ok).toBe(false);
  });

  it("treats a missing beverageIds field as no beverages", () => {
    const result = buildOrder(valid, menu);
    if (!result.ok) throw new Error(result.error);
    expect(result.items.some((i) => i.item_type === "beverage")).toBe(false);
    expect(result.order.subtotal).toBe(2585);
  });

  it("rejects a malformed payload shape without throwing", () => {
    expect(buildOrder({} as OrderPayload, menu).ok).toBe(false);
    expect(buildOrder({ ...valid, toppingIds: "T9" as unknown as string[] }, menu).ok).toBe(false);
  });
});
