import { z } from 'zod';

/**
 * Shared TripSnapshot body for save + share endpoints.
 * `isMock` must be an explicit boolean — never defaulted to live/mock here.
 * Nested `recommendation` (incl. flight/lodging `priceMode`) is opaque and preserved as sent.
 */
export const tripSnapshotSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  form: z.record(z.string(), z.unknown()),
  recommendation: z.record(z.string(), z.unknown()),
  isMock: z.boolean(),
  storageKind: z.enum(['client-local-mock', 'supabase']),
});

export type TripSnapshotInput = z.infer<typeof tripSnapshotSchema>;
