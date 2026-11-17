import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { FlightSearchService } from '../flights/service.js';
import { FixedWindowRateLimiter } from '../flights/rateLimit.js';

const searchSchema = z.object({
  originAirports: z.array(z.string().min(3).max(3)).min(1),
  destinationAirport: z.string().min(3).max(3),
  destinationId: z.string().optional(),
  travelers: z.number().int().min(1).max(9),
  tripLengthDays: z.number().int().min(1).max(30),
  departureDate: z.string(),
  returnDate: z.string(),
});

const batchSchema = z.object({
  originAirports: z.array(z.string().min(3).max(3)).min(1),
  travelers: z.number().int().min(1).max(9),
  tripLengthDays: z.number().int().min(1).max(30),
  departureDate: z.string(),
  returnDate: z.string(),
  destinations: z
    .array(
      z.object({
        id: z.string().min(1),
        airportCode: z.string().min(3).max(3),
      }),
    )
    .min(1)
    .max(20),
});

export function registerFlightRoutes(
  app: Express,
  service: FlightSearchService,
  rateLimiter: FixedWindowRateLimiter,
) {
  app.post('/api/flights/search', async (req: Request, res: Response) => {
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
        error: error instanceof Error ? error.message : 'Flight search failed',
      });
    }
  });

  app.post('/api/flights/search-batch', async (req: Request, res: Response) => {
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
        error: error instanceof Error ? error.message : 'Batch flight search failed',
      });
    }
  });
}
