import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0033_optional_oauth_mailbox.sql", import.meta.url), "utf8");
const accounts = await readFile(new URL("../../server/accounts/service.ts", import.meta.url), "utf8");
const microsoft = await readFile(new URL("../../server/providers/microsoft/service.ts", import.meta.url), "utf8");
const google = await readFile(new URL("../../server/providers/google/service.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../../lib/admin-api.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../../server/repositories/postgres.ts", import.meta.url), "utf8");

test("connected mailbox address is nullable until OAuth identifies it", () => {
  assert.match(migration, /ALTER COLUMN email_address DROP NOT NULL/);
  assert.match(migration, /WHERE email_address IS NOT NULL/);
  assert.match(accounts, /emailAddress: z\.preprocess\(optionalMailbox/);
  assert.match(accounts, /input\.emailAddress\?\.toLowerCase\(\) \?\? null/);
  assert.match(repository, /email_address: string \| null/);
  assert.match(adminApi, /emailAddress: string \| null/);
});

test("OAuth writes the provider identity back to the account-scoped mailbox row", () => {
  assert.match(microsoft, /email_address = \$5/);
  assert.match(microsoft, /provider_identity_email = \$5/);
  assert.match(google, /email_address = \$5/);
  assert.match(google, /provider_identity_email = \$5/);
});

test("explicitly configured addresses still protect against authorizing the wrong mailbox", () => {
  assert.match(microsoft, /configuredMailbox && providerIdentityEmail !== configuredMailbox/);
  assert.match(microsoft, /microsoft_mailbox_mismatch/);
  assert.match(google, /configuredMailbox && providerIdentityEmail !== configuredMailbox/);
  assert.match(google, /google_mailbox_mismatch/);
});

test("the same mailbox cannot be claimed by two provider accounts", () => {
  assert.match(migration, /provider, lower\(email_address\)/);
  assert.match(microsoft, /microsoft_mailbox_already_connected/);
  assert.match(google, /google_mailbox_already_connected/);
});

test("admin account form no longer falls back to the Kripicard login email", () => {
  assert.match(dashboard, /providerIdentityEmail \?\? account\.emailAccount\?\.emailAddress \?\? ""/);
  assert.match(dashboard, /emailAddress: accountForm\.mailbox\.trim\(\) \? accountForm\.mailbox\.trim\(\) : null/);
  assert.match(dashboard, /\.\.\.\(mailbox \? \{ emailAddress: mailbox \} : \{\}\)/);
  assert.match(dashboard, /Leave blank and click Connect/);
  assert.match(dashboard, /every connected account stores its own encrypted refresh token/);
});
