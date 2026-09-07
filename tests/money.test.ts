import { describe, it, expect } from "vitest";
import {
  formatTaka,
  formatTakaCompact,
  discountPercent,
  takaToPaisa,
  paisaToTaka,
} from "@/lib/utils/money";

describe("formatTaka", () => {
  it("renders whole taka without decimals", () => {
    expect(formatTaka(519000)).toBe("৳5,190");
  });

  it("shows paisa only when they are non-zero", () => {
    expect(formatTaka(519050)).toBe("৳5,190.50");
    expect(formatTaka(500000)).toBe("৳5,000");
  });

  it("can be forced to show paisa", () => {
    expect(formatTaka(500000, { showPaisa: true })).toBe("৳5,000.00");
  });

  it("treats null and undefined as zero rather than throwing", () => {
    expect(formatTaka(null)).toBe("৳0");
    expect(formatTaka(undefined)).toBe("৳0");
  });

  it("omits the symbol when asked", () => {
    expect(formatTaka(123400, { withSymbol: false })).toBe("1,234");
  });
});

describe("formatTakaCompact", () => {
  it("uses lakh and crore above the thresholds", () => {
    expect(formatTakaCompact(1_00_00_000 * 100)).toBe("৳1.00Cr");
    expect(formatTakaCompact(2_50_000 * 100)).toBe("৳2.50L");
    expect(formatTakaCompact(45_600 * 100)).toBe("৳45.6K");
  });

  it("falls back to the plain format below 1,000 taka", () => {
    expect(formatTakaCompact(99900)).toBe("৳999");
  });
});

describe("discountPercent", () => {
  it("rounds down so a discount is never overstated", () => {
    // 5190 off 6500 is 20.15% — must display as 20, not 21.
    expect(discountPercent(519000, 650000)).toBe(20);
  });

  it("returns null when there is nothing legitimate to strike through", () => {
    expect(discountPercent(519000, null)).toBeNull();
    expect(discountPercent(519000, 519000)).toBeNull();
    expect(discountPercent(519000, 400000)).toBeNull();
  });
});

describe("taka ↔ paisa", () => {
  it("round-trips without floating point drift", () => {
    expect(takaToPaisa("5190.50")).toBe(519050);
    expect(takaToPaisa(0.1)).toBe(10);
    expect(takaToPaisa("19.99")).toBe(1999);
    expect(paisaToTaka(519050)).toBe("5190.5");
  });

  it("treats unparseable input as zero rather than NaN", () => {
    expect(takaToPaisa("not a number")).toBe(0);
    expect(takaToPaisa("")).toBe(0);
  });

  it("returns an empty string for a null price so a form input stays blank", () => {
    expect(paisaToTaka(null)).toBe("");
    expect(paisaToTaka(undefined)).toBe("");
  });
});
