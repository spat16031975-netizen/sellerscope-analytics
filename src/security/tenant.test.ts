import { describe, expect, it } from "vitest";
import { requireOrganization, requireWriteAccess } from "./tenant";

describe("tenant isolation", () => {
  const principal = { userId: "u1", organizationId: "org-a", role: "ANALYST" as const };
  it("accepts the principal organization", () => expect(requireOrganization(principal, "org-a")).toBe("org-a"));
  it("rejects parameter tampering", () => expect(() => requireOrganization(principal, "org-b")).toThrow("FORBIDDEN_TENANT_SCOPE"));
  it("blocks viewer writes", () => expect(() => requireWriteAccess({ ...principal, role: "VIEWER" })).toThrow("FORBIDDEN_WRITE"));
});
