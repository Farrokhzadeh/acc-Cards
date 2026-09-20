import { z } from "zod";

export const googleTokenSchema = z.object({
  token_type: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.number().int().positive(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});

export const gmailProfileSchema = z.object({
  emailAddress: z.string().email(),
  messagesTotal: z.number().int().nonnegative().optional(),
  threadsTotal: z.number().int().nonnegative().optional(),
  historyId: z.string().min(1),
});

export const gmailMessageListSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1), threadId: z.string().min(1).optional() })).optional().default([]),
  nextPageToken: z.string().min(1).optional(),
  resultSizeEstimate: z.number().int().nonnegative().optional(),
});

const gmailHeaderSchema = z.object({
  name: z.string().min(1),
  value: z.string().optional().default(""),
});

export type GmailPart = {
  filename: string;
  mimeType?: string;
  headers: Array<{ name: string; value: string }>;
  parts: GmailPart[];
};

type GmailPartInput = {
  filename?: string;
  mimeType?: string;
  headers?: Array<{ name: string; value?: string }>;
  parts?: GmailPartInput[];
};

const gmailPartSchema: z.ZodType<GmailPart, z.ZodTypeDef, GmailPartInput> = z.lazy(() => z.object({
  filename: z.string().optional().default(""),
  mimeType: z.string().optional(),
  headers: z.array(gmailHeaderSchema).optional().default([]),
  parts: z.array(gmailPartSchema).optional().default([]),
}));

export const gmailMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().optional(),
  labelIds: z.array(z.string()).optional().default([]),
  snippet: z.string().optional().default(""),
  historyId: z.string().optional(),
  internalDate: z.string().regex(/^\d+$/).optional(),
  payload: gmailPartSchema.optional(),
});

const gmailHistoryMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
});

const gmailHistoryItemSchema = z.object({
  id: z.string().min(1),
  messages: z.array(gmailHistoryMessageSchema).optional().default([]),
  messagesAdded: z.array(z.object({ message: gmailHistoryMessageSchema })).optional().default([]),
  messagesDeleted: z.array(z.object({ message: gmailHistoryMessageSchema })).optional().default([]),
  labelsAdded: z.array(z.object({ message: gmailHistoryMessageSchema, labelIds: z.array(z.string()).optional().default([]) })).optional().default([]),
  labelsRemoved: z.array(z.object({ message: gmailHistoryMessageSchema, labelIds: z.array(z.string()).optional().default([]) })).optional().default([]),
});

export const gmailHistoryListSchema = z.object({
  history: z.array(gmailHistoryItemSchema).optional().default([]),
  nextPageToken: z.string().min(1).optional(),
  historyId: z.string().min(1),
});

export type GmailMessage = z.infer<typeof gmailMessageSchema>;
export type GmailHistoryList = z.infer<typeof gmailHistoryListSchema>;
