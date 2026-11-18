import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureUserByExternalKey } from '../users.js';
import { tripSnapshotSchema } from './tripSnapshotSchema.js';

function userKey(req: Request): string | null {
  const header = req.header('x-user-key');
  return header && header.trim().length > 0 ? header.trim() : null;
}

export function registerSharedTripRoutes(app: Express, supabase: SupabaseClient) {
  app.post('/api/shared-trips', async (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          snapshot: tripSnapshotSchema,
        })
        .parse(req.body);

      const key = userKey(req);
      const createdBy = key ? await ensureUserByExternalKey(supabase, key) : null;
      const shareToken = randomUUID().replace(/-/g, '');
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
        .from('shared_trips')
        .insert({
          share_token: shareToken,
          created_by: createdBy,
          destination_id: destinationId,
          snapshot,
          captured_at: body.snapshot.capturedAt,
        })
        .select('id, share_token, created_at, snapshot, captured_at')
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json({
        trip: {
          id: data.share_token,
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

  app.get('/api/shared-trips/:token', async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('shared_trips')
        .select('share_token, created_at, snapshot, captured_at, expires_at')
        .eq('share_token', req.params.token)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        res.status(404).json({ error: 'Share not found' });
        return;
      }
      if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
        res.status(410).json({ error: 'Share expired' });
        return;
      }

      res.json({
        trip: {
          id: data.share_token,
          createdAt: data.created_at,
          snapshot: data.snapshot,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
