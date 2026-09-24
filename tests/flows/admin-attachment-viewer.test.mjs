import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewer = await readFile(new URL("../../components/admin/attachment-viewer.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");

test("admin attachment viewer fetches protected files into one modal and supports images, PDFs, download, and navigation", () => {
  assert.match(viewer, /openAdminAttachment/);
  assert.match(viewer, /AdminAttachmentViewer/);
  assert.match(viewer, /credentials: "same-origin"/);
  assert.match(viewer, /cache: "no-store"/);
  assert.match(viewer, /URL\.createObjectURL/);
  assert.match(viewer, /mime\.startsWith\("image\/"\)/);
  assert.match(viewer, /application\/pdf/);
  assert.match(viewer, /<iframe/);
  assert.match(viewer, /Download file/);
  assert.match(viewer, /Previous/);
  assert.match(viewer, /Next/);
});

test("dashboard mounts the shared viewer and routes customer evidence through it", () => {
  assert.match(dashboard, /<AdminAttachmentViewer \/>/);
  assert.match(dashboard, /openAdminAttachment\(\{ url: fundingReceiptDownloadUrl/);
  assert.match(dashboard, /openAdminAttachment\(\{ url: customerPaymentReceiptUrl/);
  assert.match(dashboard, /openAdminAttachment\(\{ url: clientReceiptUrl/);
  assert.match(dashboard, /openAdminAttachment\(\{ url: kycDocumentUrl/);
  assert.match(dashboard, /Support attachment/);
  assert.doesNotMatch(dashboard, /window\.open\(fundingReceiptDownloadUrl/);
});

test("attachment links no longer use new tabs while true external provider links still may", () => {
  assert.doesNotMatch(dashboard, /href=\{customerPaymentReceiptUrl[^\n]*target="_blank"/);
  assert.doesNotMatch(dashboard, /href=\{clientReceiptUrl[^\n]*target="_blank"/);
  assert.doesNotMatch(dashboard, /href=\{kycDocumentUrl[^\n]*target="_blank"/);
  assert.match(dashboard, /portalUrl\} target="_blank"/);
  assert.match(dashboard, /consoleUrl\} target="_blank"/);
});
