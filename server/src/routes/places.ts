import { Router, Request, Response } from 'express';
import type { PlacesRequest, PlacesResponse, ApiError } from '@volt/shared';
import { loadSuperchargers } from '../data/loader.js';
import {
  getRestaurantsForCharger,
  flushPlacesCache,
} from '../places/placesClient.js';

export const placesRouter = Router();

export const MAX_CHARGERS_PER_REQUEST = 20;

export function validatePlacesRequest(body: unknown): PlacesRequest | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.chargerIds)) return 'chargerIds must be an array';
  if (b.chargerIds.length === 0) return 'chargerIds must not be empty';
  if (b.chargerIds.length > MAX_CHARGERS_PER_REQUEST) {
    return `chargerIds must contain at most ${MAX_CHARGERS_PER_REQUEST} ids`;
  }
  if (!b.chargerIds.every((id): id is string => typeof id === 'string')) {
    return 'chargerIds entries must all be strings';
  }
  return { chargerIds: b.chargerIds };
}

placesRouter.post('/places', async (req: Request, res: Response) => {
  const parsed = validatePlacesRequest(req.body);
  if (typeof parsed === 'string') {
    const err: ApiError = { error: 'invalid_request', details: parsed };
    return res.status(400).json(err);
  }

  const chargers = loadSuperchargers();
  const byId = new Map(chargers.map((c) => [c.id, c]));
  const result: PlacesResponse = {};

  // Parallel lookups; one failure shouldn't drop the whole batch.
  await Promise.all(
    parsed.chargerIds.map(async (id) => {
      const charger = byId.get(id);
      if (!charger) {
        result[id] = [];
        return;
      }
      try {
        result[id] = await getRestaurantsForCharger(id, charger.location);
      } catch {
        result[id] = [];
      }
    }),
  );

  flushPlacesCache();
  return res.json(result);
});
