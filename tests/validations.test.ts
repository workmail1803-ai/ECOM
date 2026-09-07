import { describe, it, expect } from "vitest";
import { bdPhone, checkoutSchema } from "@/lib/validations/checkout";
import { parseProductQuery } from "@/lib/validations/catalog";

describe("bdPhone", () => {
  it("normalises every form a Bangladeshi customer might type", () => {
    for (const input of [
      "01712345678",
      "+8801712345678",
      "8801712345678",
      "1712345678",
      "017 1234 5678",
      "017-1234-5678",
    ]) {
      expect(bdPhone.parse(input)).toBe("01712345678");
    }
  });

  it("accepts every live BD operator prefix", () => {
    for (const prefix of ["013", "014", "015", "016", "017", "018", "019"]) {
      expect(bdPhone.parse(`${prefix}12345678`)).toBe(`${prefix}12345678`);
    }
  });

  it("rejects numbers that are not valid BD mobiles", () => {
    for (const bad of ["0121234567", "012345", "0171234567", "017123456789", ""]) {
      expect(bdPhone.safeParse(bad).success).toBe(false);
    }
  });
});

describe("checkoutSchema", () => {
  const valid = {
    customer_name: "Nazmul Hasan",
    customer_phone: "01712345678",
    district: "Dhaka",
    area: "Dhanmondi",
    street: "House 12, Road 5",
    payment_method: "cod",
  };

  it("accepts a complete address", () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
  });

  it("does not accept a price, total or discount from the client", () => {
    // The whole security model rests on this: place_order() re-quotes, and a
    // money field in the payload must be ignored rather than trusted.
    const parsed = checkoutSchema.parse({
      ...valid,
      total_paisa: 1,
      subtotal_paisa: 1,
      discount_paisa: 999999,
      price: 1,
    });

    expect(parsed).not.toHaveProperty("total_paisa");
    expect(parsed).not.toHaveProperty("subtotal_paisa");
    expect(parsed).not.toHaveProperty("discount_paisa");
    expect(parsed).not.toHaveProperty("price");
  });

  it("rejects a payment method that is not a known provider", () => {
    expect(
      checkoutSchema.safeParse({ ...valid, payment_method: "bitcoin" }).success,
    ).toBe(false);
  });

  it("requires a street specific enough for a courier to find", () => {
    expect(checkoutSchema.safeParse({ ...valid, street: "x" }).success).toBe(false);
  });
});

describe("parseProductQuery", () => {
  it("falls back to defaults rather than throwing on junk input", () => {
    const q = parseProductQuery({ sort: "lol", page: "-3", rating: "99" });
    expect(q.sort).toBe("newest");
    expect(q.page).toBe(1);
  });

  it("keeps valid filters", () => {
    const q = parseProductQuery({
      category: "power-bank",
      sort: "price_asc",
      page: "2",
      min: "500",
      max: "5000",
      in_stock: "1",
    });

    expect(q.category).toBe("power-bank");
    expect(q.sort).toBe("price_asc");
    expect(q.page).toBe(2);
    expect(q.min).toBe(500);
    expect(q.max).toBe(5000);
    expect(q.in_stock).toBe("1");
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseProductQuery({ category: ["power-bank", "projector"] }).category).toBe(
      "power-bank",
    );
  });

  it("ignores empty strings so ?q= does not become a search for nothing", () => {
    expect(parseProductQuery({ q: "" }).q).toBeUndefined();
  });
});
