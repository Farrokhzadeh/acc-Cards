import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0031_kyc_delivery_address.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../../server/kyc/service.ts", import.meta.url), "utf8");
const messages = await readFile(new URL("../../server/kyc/messages.ts", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const clientKycRoute = await readFile(new URL("../../app/api/v1/clients/[id]/kyc/route.ts", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../../lib/admin-api.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../../app/clients/[id]/client-workspace-page.tsx", import.meta.url), "utf8");

test("KYC schema stores a structured card-delivery address and extends the bot state machine", () => {
  assert.match(migration, /delivery_country/);
  assert.match(migration, /delivery_province/);
  assert.match(migration, /delivery_city/);
  assert.match(migration, /delivery_address_line/);
  assert.match(migration, /delivery_postal_code/);
  assert.match(migration, /kyc_delivery_country/);
  assert.match(migration, /kyc_delivery_address/);
  assert.match(migration, /kyc_delivery_postal/);
});

test("Telegram explains why the address is collected and requires it before KYC submission", () => {
  assert.match(messages, /Home\/card-delivery address/);
  assert.match(messages, /send your card to you/);
  assert.match(messages, /آدرس منزل/);
  assert.match(bot, /askDeliveryCountry/);
  assert.match(bot, /askDeliveryProvince/);
  assert.match(bot, /askDeliveryCity/);
  assert.match(bot, /askDeliveryAddress/);
  assert.match(bot, /askDeliveryPostal/);
  assert.match(bot, /deliveryAddressLine/);
  assert.match(bot, /deliveryPostalCode/);
  assert.match(bot, /kyc_incomplete/);
  assert.match(bot, /Card delivery address/);
  assert.match(bot, /isSensitiveKycFlow/);
  assert.match(bot, /!isSensitiveKycFlow/);
});

test("KYC service persists and returns delivery address fields", () => {
  assert.match(service, /deliveryCountry/);
  assert.match(service, /deliveryProvince/);
  assert.match(service, /deliveryCity/);
  assert.match(service, /deliveryAddressLine/);
  assert.match(service, /deliveryPostalCode/);
  assert.match(service, /delivery_country/);
  assert.match(service, /delivery_address_line/);
});

test("admin KYC review and customer page expose the card-delivery address", () => {
  assert.match(clientKycRoute, /delivery_country/);
  assert.match(clientKycRoute, /deliveryAddressLine/);
  assert.match(adminApi, /deliveryCountry/);
  assert.match(adminApi, /deliveryAddressLine/);
  assert.match(dashboard, /Card delivery address/);
  assert.match(dashboard, /Delivery country/);
  assert.match(workspace, /Card delivery address/);
  assert.match(workspace, /Collected so the customer’s card can be sent to this address/);
});
