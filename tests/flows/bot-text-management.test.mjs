import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../db/migrations/0034_bot_text_management.sql", import.meta.url), "utf8");
const messages = await readFile(new URL("../../server/kyc/messages.ts", import.meta.url), "utf8");
const management = await readFile(new URL("../../server/telegram/text-management.ts", import.meta.url), "utf8");
const bot = await readFile(new URL("../../server/telegram/bot.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../../server/providers/telegram/client.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../../app/dashboard-app.tsx", import.meta.url), "utf8");
const listRoute = await readFile(new URL("../../app/api/v1/telegram/texts/route.ts", import.meta.url), "utf8");
const itemRoute = await readFile(new URL("../../app/api/v1/telegram/texts/[key]/route.ts", import.meta.url), "utf8");
const imageRoute = await readFile(new URL("../../app/api/v1/telegram/texts/[key]/image/route.ts", import.meta.url), "utf8");

test("bot text storage keeps bilingual overrides and optional images", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bot_text_overrides/);
  assert.match(migration, /en_text text NOT NULL/);
  assert.match(migration, /fa_text text NOT NULL/);
  assert.match(migration, /image_bytes bytea/);
  assert.match(migration, /bot_texts\.manage/);
});

test("translation catalog exposes stable Android-style keys and runtime overrides", () => {
  assert.match(messages, /getBotTextCatalog/);
  assert.match(messages, /key: .*section.*name/s);
  assert.match(messages, /applyBotTextOverrides/);
  assert.match(messages, /overridesBySignature/);
  assert.match(messages, /COMMON\.welcome|COMMON/);
  assert.match(messages, /export const BOT/);
});

test("managed text service validates placeholders and image types", () => {
  assert.match(management, /bot_text_placeholders_invalid/);
  assert.match(management, /image\/jpeg/);
  assert.match(management, /image\/png/);
  assert.match(management, /image\/webp/);
  assert.match(management, /5 \* 1024 \* 1024/);
  assert.match(management, /imageForRenderedBotText/);
});

test("Telegram loads managed texts and can send configured images", () => {
  assert.match(bot, /refreshBotTextRuntime/);
  assert.match(bot, /imageForRenderedBotText/);
  assert.match(client, /sendPhoto/);
  assert.match(client, /new InputFile\(input\.bytes/);
});

test("admin exposes a dedicated searchable bilingual bot-text page", () => {
  assert.match(dashboard, /"bot-texts"/);
  assert.match(dashboard, /BotTextsView/);
  assert.match(dashboard, /Translation keys/);
  assert.match(dashboard, /English/);
  assert.match(dashboard, /فارسی/);
  assert.match(dashboard, /Choose image/);
  assert.match(dashboard, /Reset text/);
});

test("bot text APIs require dedicated read/manage permissions", () => {
  assert.match(listRoute, /bot_texts\.read/);
  assert.match(itemRoute, /bot_texts\.manage/);
  assert.match(itemRoute, /requireCsrf/);
  assert.match(imageRoute, /bot_texts\.read/);
  assert.match(imageRoute, /bot_texts\.manage/);
  assert.match(imageRoute, /requireCsrf/);
});
