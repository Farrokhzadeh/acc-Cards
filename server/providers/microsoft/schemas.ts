import { z } from "zod";

export const microsoftTokenSchema = z.object({
  token_type: z.string(),
  scope: z.string().optional(),
  expires_in: z.number().int().positive(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});

export const microsoftProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().nullable().optional(),
  mail: z.string().email().nullable().optional(),
  userPrincipalName: z.string().min(1).nullable().optional(),
});

const emailAddressSchema = z.object({
  name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const microsoftMessageSchema = z.object({
  id: z.string().min(1),
  internetMessageId: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  from: z.object({ emailAddress: emailAddressSchema }).nullable().optional(),
  toRecipients: z.array(z.object({ emailAddress: emailAddressSchema })).optional().default([]),
  receivedDateTime: z.string().min(1),
  bodyPreview: z.string().nullable().optional(),
  isRead: z.boolean().optional().default(false),
  hasAttachments: z.boolean().optional().default(false),
});

export const microsoftRemovedMessageSchema = z.object({
  id: z.string().min(1),
  "@removed": z.object({ reason: z.string().optional() }),
});

export const microsoftDeltaSchema = z.object({
  value: z.array(z.union([microsoftMessageSchema, microsoftRemovedMessageSchema])),
  "@odata.nextLink": z.string().url().optional(),
  "@odata.deltaLink": z.string().url().optional(),
});

export type MicrosoftMessage = z.infer<typeof microsoftMessageSchema>;
