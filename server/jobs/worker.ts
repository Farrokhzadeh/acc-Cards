import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { getPool } from "@/server/database/pool";
import { workerTick } from "@/server/jobs/runner";
import { redactSensitiveText } from "@/server/security/redaction";

const env = parseServerEnv(process.env);
const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
let stopping = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(JSON.stringify({ level: "info", event: "worker.started", workerId }));
  while (!stopping) {
    try {
      const result = await workerTick(workerId, env.WORKER_LEASE_SECONDS);
      if (!result) await sleep(env.WORKER_POLL_INTERVAL_MS);
      else console.log(JSON.stringify({ level: result.status === "succeeded" ? "info" : "warn", event: "worker.job", workerId, ...result }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "worker.loop_error", workerId, message: redactSensitiveText(error) }));
      await sleep(Math.max(env.WORKER_POLL_INTERVAL_MS, 1000));
    }
  }
  await getPool().end();
  console.log(JSON.stringify({ level: "info", event: "worker.stopped", workerId }));
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => { stopping = true; });
}

await main();
