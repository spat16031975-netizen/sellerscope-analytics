import { describe, expect, it } from "vitest";
import { reportKind } from "./dashboard";

describe("reportKind", () => {
  it("does not mistake adjacent quantity and status headers for stock data", () => {
    expect(reportKind("orders.csv", ["Количество", "Статус"])).toBe("Продажи");
  });

  it("still recognizes stock reports from a single header", () => {
    expect(reportKind("catalog.csv", ["Доступно к продаже", "Остаток"])).toBe("Остатки");
  });
});

