import { Router } from 'express';
import type { Response } from 'express';
import crypto from 'node:crypto';
import type { ApiError, RouteRequest } from '@volt/shared';
import { requireAuth, type AuthRequest } from '../auth/clerk.js';
import { getTrips, saveTrip, deleteTrip, renameTrip } from '../dynamo/userData.js';

export const tripsRouter = Router();

function isValidRouteRequest(v: unknown): v is RouteRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const isLatLng = (x: unknown): boolean =>
    !!x &&
    typeof x === 'object' &&
    typeof (x as Record<string, unknown>).lat === 'number' &&
    typeof (x as Record<string, unknown>).lng === 'number';

  return (
    isLatLng(r.start) &&
    isLatLng(r.end) &&
    typeof r.vehicleRangeKm === 'number' &&
    typeof r.startBatteryPct === 'number' &&
    typeof r.minArrivalBatteryPct === 'number'
  );
}

tripsRouter.get('/trips', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = req as AuthRequest;
    const trips = await getTrips(userId);
    res.json(trips);
  } catch (e) {
    const err: ApiError = {
      error: 'trips_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    res.status(500).json(err);
  }
});

tripsRouter.post('/trips', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest;
  const body = req.body as Record<string, unknown>;

  if (typeof body.name !== 'string' || body.name.length === 0) {
    const err: ApiError = {
      error: 'invalid_request',
      details: 'name must be a non-empty string',
    };
    res.status(400).json(err);
    return;
  }

  if (!isValidRouteRequest(body.request)) {
    const err: ApiError = {
      error: 'invalid_request',
      details: 'request must be a valid RouteRequest object',
    };
    res.status(400).json(err);
    return;
  }

  try {
    const trip = {
      tripId: crypto.randomUUID(),
      name: body.name,
      request: body.request,
      createdAt: new Date().toISOString(),
    };
    await saveTrip(userId, trip);
    res.status(201).json(trip);
  } catch (e) {
    const err: ApiError = {
      error: 'trips_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    res.status(500).json(err);
  }
});

tripsRouter.patch('/trips/:tripId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest;
  const tripId = req.params.tripId as string;
  const body = req.body as Record<string, unknown>;

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    const err: ApiError = {
      error: 'invalid_request',
      details: 'name must be a non-empty string',
    };
    res.status(400).json(err);
    return;
  }

  try {
    await renameTrip(userId, tripId, body.name.trim());
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.name === 'ConditionalCheckFailedException') {
      const err: ApiError = { error: 'not_found', details: 'trip not found' };
      res.status(404).json(err);
      return;
    }
    const err: ApiError = {
      error: 'trips_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    res.status(500).json(err);
  }
});

tripsRouter.delete('/trips/:tripId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest;
  const tripId = req.params.tripId as string;

  try {
    await deleteTrip(userId, tripId);
    res.status(204).send();
  } catch (e) {
    const err: ApiError = {
      error: 'trips_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    res.status(500).json(err);
  }
});
