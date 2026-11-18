import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("marketplace API connection", () => {
  it("rejects a malformed request without contacting a marketplace", async () => {
    const response = await POST(new Request("http://localhost/api/marketplace/connect", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ connected: false });
  });

  it("requires the credentials expected by each marketplace", async () => {
    const ozon = await POST(new Request("http://localhost/api/marketplace/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "ozon" }),
    }));
    const wb = await POST(new Request("http://localhost/api/marketplace/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "wb" }),
    }));
    expect(ozon.status).toBe(400);
    expect(wb.status).toBe(400);
  });
});
