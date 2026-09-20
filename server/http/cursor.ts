import { z } from "zod";

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export type PageCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value?: string | null): PageCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return cursorSchema.parse(parsed);
  } catch {
    return undefined;
  }
}
