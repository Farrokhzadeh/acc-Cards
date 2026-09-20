import { z } from "zod";
import { ApiError } from "@/server/http/api";

const uuidSchema = z.string().uuid();

export function requireUuid(value: string, label = "id") {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "validation_error", `${label} must be a valid UUID.`);
  }
  return parsed.data;
}
