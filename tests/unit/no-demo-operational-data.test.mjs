import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

test("deployment tooling does not expose a demo database seeder", async () => {
  assert.equal(Object.hasOwn(packageJson.scripts, "db:seed-demo"), false);
  await assert.rejects(access(new URL("../../scripts/db/seed-demo.sh", import.meta.url)));
  await assert.rejects(access(new URL("../../db/seeds/demo.sql", import.meta.url)));
});

test("repository does not ship stale demo operational guidance", async () => {
  await assert.rejects(access(new URL("../../docs/archive/ACCABAD-DEMO-NOTES.md", import.meta.url)));
  assert.match(readme, /No demo operational records are shipped or seeded/);
});
