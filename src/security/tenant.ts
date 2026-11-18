export type TenantPrincipal = {
  userId: string;
  organizationId: string;
  role: "OWNER" | "ANALYST" | "VIEWER";
};

export function requireOrganization(principal: TenantPrincipal, requestedOrganizationId: string) {
  if (principal.organizationId !== requestedOrganizationId) {
    throw new Error("FORBIDDEN_TENANT_SCOPE");
  }
  return principal.organizationId;
}

export function requireWriteAccess(principal: TenantPrincipal) {
  if (principal.role === "VIEWER") throw new Error("FORBIDDEN_WRITE");
}
