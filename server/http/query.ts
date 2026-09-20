import { z } from "zod";
import { ApiError } from "@/server/http/api";
import { decodeCursor } from "@/server/http/cursor";

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  cursor: z.string().max(1000).optional(),
});

export function parsePageRequest(request: Request) {
  const url = new URL(request.url);
  const parsed = pageSchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  const cursor = decodeCursor(parsed.cursor);
  if (parsed.cursor && !cursor) {
    throw new ApiError(400, "validation_error", "The pagination cursor is invalid.");
  }
  return { limit: parsed.limit, search: parsed.search || undefined, cursor };
}
