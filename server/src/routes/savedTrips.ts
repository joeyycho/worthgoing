import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureUserByExternalKey } from '../users.js';

const snapshotSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  form: z.record(z.string(), z.unknown()),
  recommendation: z.record(z.string(), z.unknown()),
  isMock: z.literal(true),
  storageKind: z.enum(['client-local-mock', 'supabase']),
});

function userKey(req: Request): string | null {
  const header = req.header('x-user-key');
  return header && header.trim().length > 0 ? header.trim() : null;
}

export function registerSavedTripRoutes(app: Express, supabase: SupabaseClient) {
  app.get('/api/saved-trips', async (req: Request, res: Response) => {
    try {
      const key = userKey(req);
      if (!key) {
        res.status(401).json({ error: 'Missing X-User-Key' });
        return;
      }
      const userId = await ensureUserByExternalKey(supabase, key);
      const { data, error } = await supabase
        .from('saved_trips')
        .select('id, created_at, snapshot, captured_at, destination_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      res.json({
        trips: (data ?? []).map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          snapshot: {
            ...(row.snapshot as object),
            storageKind: 'supabase',
            capturedAt: row.captured_at ?? (row.snapshot as { capturedAt?: string }).capturedAt,
          },
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/saved-trips', async (req: Request, res: Response) => {
    try {
      const key = userKey(req);
      if (!key) {
        res.status(401).json({ error: 'Missing X-User-Key' });
        return;
      }

      const body = z
        .object({
          snapshot: snapshotSchema,
        })
        .parse(req.body);

      const userId = await ensureUserByExternalKey(supabase, key);
      const destinationId =
        typeof body.snapshot.recommendation === 'object' &&
        body.snapshot.recommendation &&
        'destination' in body.snapshot.recommendation &&
        typeof (body.snapshot.recommendation as { destination?: { id?: string } }).destination?.id ===
          'string'
          ? (body.snapshot.recommendation as { destination: { id: string } }).destination.id
          : null;

      const snapshot = {
        ...body.snapshot,
        storageKind: 'supabase' as const,
      };

      const { data, error } = await supabase
        .from('saved_trips')
        .insert({
          user_id: userId,
          destination_id: destinationId,
          snapshot,
          captured_at: body.snapshot.capturedAt,
        })
        .select('id, created_at, snapshot, captured_at')
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json({
        trip: {
          id: data.id,
          createdAt: data.created_at,
          snapshot: data.snapshot,
        },
      });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      res.status(status).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.delete('/api/saved-trips/:id', async (req: Request, res: Response) => {
    try {
      const key = userKey(req);
      if (!key) {
        res.status(401).json({ error: 'Missing X-User-Key' });
        return;
      }
      const userId = await ensureUserByExternalKey(supabase, key);
      const { error } = await supabase
        .from('saved_trips')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
