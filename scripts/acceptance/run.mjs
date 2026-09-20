import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeStagingTarget, loadAcceptanceConfig, redactEvidence, requiredStagingSecrets } from "./safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modeArgument = process.argv.find((value) => value.startsWith("--mode="));
const mode = modeArgument?.slice("--mode=".length);
if (!['simulated', 'staging'].includes(mode)) throw new Error("Use --mode=simulated or --mode=staging.");

if (mode === "staging") {
  const { config } = await loadAcceptanceConfig();
  assertSafeStagingTarget(config);
  const missing = requiredStagingSecrets();
  if (missing.length) throw new Error(`Missing staging secrets: ${missing.join(", ")}`);
}

const manifest = JSON.parse(await readFile(path.join(root, "acceptance/phase23-manifest.json"), "utf8"));
const timestamp = new Date().toISOString();
const evidenceDirectory = path.resolve(process.env.ACCEPTANCE_EVIDENCE_DIR ?? path.join(root, "acceptance-evidence"));
await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
const results = [];

function execute(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, env: process.env, shell: false });
    const chunks = [];
    child.stdout.on("data", (chunk) => { process.stdout.write(chunk); chunks.push(Buffer.from(chunk)); });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); chunks.push(Buffer.from(chunk)); });
    child.on("error", (error) => resolve({ exitCode: null, output: error.message }));
    child.on("close", (exitCode) => resolve({ exitCode, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

for (const category of manifest.categories) {
  if (!category.modes.includes(mode)) {
    results.push({ id: category.id, label: category.label, status: "blocked", reason: `Requires ${category.modes.join(" or ")} mode.` });
    continue;
  }
  const [command, ...args] = category.command;
  const startedAt = new Date().toISOString();
  const execution = await execute(command, args);
  const status = execution.exitCode === 0 ? "passed" : "failed";
  results.push({ id: category.id, label: category.label, status, startedAt, finishedAt: new Date().toISOString(), exitCode: execution.exitCode });
  await writeFile(path.join(evidenceDirectory, `${category.id}.log`), String(redactEvidence(execution.output)), { mode: 0o600 });
}

const report = redactEvidence({ phase: 23, mode, startedAt: timestamp, finishedAt: new Date().toISOString(), results });
const reportPath = path.join(evidenceDirectory, `phase23-${mode}-report.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(`Phase 23 evidence report: ${reportPath}`);
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
