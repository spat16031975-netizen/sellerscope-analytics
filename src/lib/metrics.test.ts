import { describe, expect, it } from "vitest";
import { calculateDrr, calculateMargin, calculateRoas, completeness } from "./metrics";

describe("management metrics", () => {
  it("does not invent a value for zero denominator", () => {
    expect(calculateDrr(100, 0)).toBeNull();
    expect(calculateRoas(100, 0)).toBeNull();
  });

  it("calculates documented ratios", () => {
    expect(calculateDrr(250, 2000)).toBe(12.5);
    expect(calculateRoas(2000, 250)).toBe(8);
    expect(calculateMargin(400, 2000)).toBe(20);
  });

  it("reports missing inputs instead of replacing them with zero", () => {
    expect(completeness({ revenue: 1200, cost: null })).toEqual({ complete: false, missing: ["cost"] });
  });
});
