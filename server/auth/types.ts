export type AdminRole = "super_admin" | "operator" | "finance_reviewer";

export type AdminPrincipal = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: string[];
  mfaEnabled: boolean;
};

export type AuthSession = {
  id: string;
  tokenHash: string;
  csrfTokenHash: string;
  reauthenticatedAt: Date | null;
  expiresAt: Date;
  principal: AdminPrincipal;
};
