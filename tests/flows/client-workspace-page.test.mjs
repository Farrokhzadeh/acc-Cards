import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../../app/clients/[id]/page.tsx", import.meta.url), "utf8");
const workspacePage = await readFile(new URL("../../app/clients/[id]/client-workspace-page.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../../app/api/v1/clients/[id]/workspace/route.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../../server/clients/workspace.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../../lib/admin-api.ts", import.meta.url), "utf8");

test("full customer page is a protected dedicated route", () => {
  assert.match(page, /AdminAuthGate/);
  assert.match(page, /ClientWorkspacePage/);
  assert.match(route, /dashboard\.read/);
  assert.match(route, /getClientWorkspace/);
  assert.match(adminApi, /fetchClientWorkspace/);
  assert.match(adminApi, /ClientWorkspace/);
});

test("customer workspace stays scoped to one Telegram customer while exposing admin operational context", () => {
  assert.match(service, /WHERE id=\$1::uuid/);
  assert.match(service, /taa\.telegram_user_id=\$1::uuid/);
  assert.match(service, /WHERE user_id=\$1::uuid/);
  assert.match(service, /card_transactions/);
  assert.match(service, /card_requests/);
  assert.match(service, /funding_requests/);
  assert.match(service, /audit_logs/);
  assert.match(service, /metadata_redacted->>'userId'/);
  assert.match(service, /totalCardBalanceUsdCents/);
});

test("customer page includes the planned workspace sections and unified financial activity", () => {
  for (const section of ["Overview", "Cards", "Financial activity", "Requests", "KYC", "Support", "Admin activity"]) {
    assert.ok(workspacePage.includes(section), "missing section: " + section);
  }
  assert.match(workspacePage, /fetchClientPayments/);
  assert.match(workspacePage, /workspace\?\.transactions/);
  assert.match(workspacePage, /customerPaysRial/);
  assert.match(workspacePage, /rateRialPerUsd/);
  assert.match(workspacePage, /customerPaymentReceiptUrl/);
});

test("customer page keeps support usable and reuses the shared attachment modal", () => {
  assert.match(workspacePage, /fetchClientSupportMessages/);
  assert.match(workspacePage, /sendClientSupportMessage/);
  assert.match(workspacePage, /openAdminAttachment/);
  assert.match(workspacePage, /kycDocumentUrl/);
  assert.match(workspacePage, /Support attachment/);
  assert.match(workspacePage, /<AdminAttachmentViewer \/>/);
});

test("existing client drawer links to the full page and no longer embeds the full payment ledger", () => {
  assert.match(dashboard, /Open full page/);
  assert.match(dashboard, /\/clients\//);
  assert.doesNotMatch(dashboard, /ClientFinancialHistorySection/);
});
