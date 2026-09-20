import net from "node:net";
import { parseServerEnv } from "@/config/env-schema.mjs";
import { ApiError } from "@/server/http/api";

export type AntivirusScan = {
  performed: boolean;
  clean: boolean;
  engine: string;
  note: string;
};

function clamAvScan(bytes: Buffer, host: string, port: number, timeoutMs: number): Promise<AntivirusScan> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error?: Error, result?: AntivirusScan) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(result!);
    };
    socket.setTimeout(timeoutMs, () => finish(new Error("ClamAV scan timed out.")));
    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("end", () => {
      const response = Buffer.concat(chunks).toString("utf8").replace(/\0+$/g, "").trim();
      if (/\bOK$/.test(response)) {
        finish(undefined, { performed: true, clean: true, engine: "clamav", note: "ClamAV reported the receipt clean." });
        return;
      }
      if (/\bFOUND$/.test(response)) {
        finish(undefined, { performed: true, clean: false, engine: "clamav", note: "ClamAV rejected the receipt as potentially malicious." });
        return;
      }
      finish(new Error(`Unexpected ClamAV response: ${response.slice(0, 160)}`));
    });
    socket.on("connect", () => {
      // clamd INSTREAM protocol: command, one or more 32-bit length-prefixed chunks, then zero length.
      socket.write(Buffer.from("zINSTREAM\0", "ascii"));
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(bytes.length, 0);
      socket.write(header);
      socket.write(bytes);
      socket.write(Buffer.alloc(4));
      socket.end();
    });
  });
}

export async function scanFileForMalware(bytes: Buffer): Promise<AntivirusScan> {
  const env = parseServerEnv(process.env);
  const host = env.RECEIPT_CLAMAV_HOST?.trim();
  if (!host) {
    if (env.RECEIPT_REQUIRE_ANTIVIRUS) {
      throw new ApiError(503, "receipt_antivirus_unavailable", "Receipt antivirus scanning is required but no scanner is configured.");
    }
    return {
      performed: false,
      clean: true,
      engine: "none",
      note: "External antivirus was not configured; only strict file type/size validation was performed.",
    };
  }
  try {
    const result = await clamAvScan(bytes, host, env.RECEIPT_CLAMAV_PORT, env.RECEIPT_CLAMAV_TIMEOUT_MS);
    if (!result.clean) throw new ApiError(422, "receipt_malware_detected", "The receipt was rejected by malware scanning.");
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (env.RECEIPT_REQUIRE_ANTIVIRUS) {
      throw new ApiError(503, "receipt_antivirus_unavailable", "Receipt antivirus scanning could not be completed.");
    }
    return {
      performed: false,
      clean: true,
      engine: "clamav_unavailable",
      note: "ClamAV was configured but unavailable; strict file type/size validation passed. Configure REQUIRE_ANTIVIRUS=true before accepting real payment evidence.",
    };
  }
}

export const scanReceiptForMalware = scanFileForMalware;
