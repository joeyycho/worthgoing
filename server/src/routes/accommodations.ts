import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { AccommodationSearchService } from '../accommodations/service.js';
import { FixedWindowRateLimiter } from '../flights/rateLimit.js';

const searchSchema = z.object({
  city: z.string().min(1),
  country: z.string().min(1),
  cityCode: z.string().min(3).max(3).optional(),
  airportCode: z.string().min(3).max(3).optional(),
  destinationId: z.string().optional(),
  travelers: z.number().int().min(1).max(9),
  nights: z.number().int().min(1).max(30),
  rooms: z.number().int().min(1).max(9).optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
});

const batchSchema = z.object({
  travelers: z.number().int().min(1).max(9),
  nights: z.number().int().min(1).max(30),
  rooms: z.number().int().min(1).max(9).optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  destinations: z
    .array(
      z.object({
        id: z.string().min(1),
        city: z.string().min(1),
        country: z.string().min(1),
        cityCode: z.string().min(3).max(3).optional(),
        airportCode: z.string().min(3).max(3).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export function registerAccommodationRoutes(
  app: Express,
  service: AccommodationSearchService,
  rateLimiter: FixedWindowRateLimiter,
) {
  app.post('/api/accommodations/search', async (req: Request, res: Response) => {
    const limit = rateLimiter.tryConsume(req.ip ?? 'anon');
    if (!limit.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfterMs: limit.retryAfterMs,
      });
      return;
    }

    try {
      const query = searchSchema.parse(req.body);
      const result = await service.searchOne(query, null);
      res.json(result);
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 502;
      res.status(status).json({
        error: error instanceof Error ? error.message : 'Accommodation search failed',
      });
    }
  });

  app.post('/api/accommodations/search-batch', async (req: Request, res: Response) => {
    const limit = rateLimiter.tryConsume(req.ip ?? 'anon');
    if (!limit.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfterMs: limit.retryAfterMs,
      });
      return;
    }

    try {
      const body = batchSchema.parse(req.body);
      const result = await service.searchBatch(body, null);
      res.json(result);
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 502;
      res.status(status).json({
        error: error instanceof Error ? error.message : 'Batch accommodation search failed',
      });
    }
  });
}
