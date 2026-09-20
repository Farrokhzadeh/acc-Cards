import { performance } from "node:perf_hooks";
import { assertSafeStagingTarget, loadAcceptanceConfig } from "./safety.mjs";

const { config } = await loadAcceptanceConfig();
const target = assertSafeStagingTarget(config);
const settings = config.loadSmoke ?? {};
const requests = Number(settings.requests ?? 100);
const concurrency = Number(settings.concurrency ?? 5);
const maximumP95Ms = Number(settings.maximumP95Ms ?? 1500);
if (!Number.isInteger(requests) || requests < 1 || requests > 500) throw new Error("loadSmoke.requests must be between 1 and 500.");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error("loadSmoke.concurrency must be between 1 and 20.");
if (!Number.isFinite(maximumP95Ms) || maximumP95Ms < 100 || maximumP95Ms > 10000) throw new Error("loadSmoke.maximumP95Ms must be between 100 and 10000.");

const durations = [];
let cursor = 0;
let failures = 0;
async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    try {
      const response = await fetch(new URL("/health", target), { headers: { "user-agent": "accabad-phase23-load-smoke" } });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch { failures += 1; }
    durations.push(performance.now() - started);
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
durations.sort((left, right) => left - right);
const p95 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)];
const summary = { target: target.origin, requests, concurrency, failures, p95Ms: Math.round(p95 * 100) / 100, maximumP95Ms };
console.log(JSON.stringify(summary, null, 2));
if (failures > 0 || p95 > maximumP95Ms) process.exitCode = 1;
