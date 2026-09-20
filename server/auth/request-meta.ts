import { isIP } from "node:net";
import { parseServerEnv } from "@/config/env-schema.mjs";

export function requestIp(request: Request) {
  const trustedHops = parseServerEnv(process.env).TRUST_PROXY_HOPS;
  if (trustedHops === 0) return null;
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selected = forwarded[forwarded.length - trustedHops];
  if (selected && isIP(selected)) return selected;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (trustedHops === 1 && realIp && isIP(realIp)) return realIp;
  return null;
}

export function requestUserAgent(request: Request) {
  const value = request.headers.get("user-agent")?.trim();
  return value ? value.slice(0, 500) : null;
}
