import { Router } from 'express';
import type { Response } from 'express';
import type { ApiError } from '@volt/shared';
import { requireAuth, type AuthRequest } from '../auth/clerk.js';
import { getFavorites, addFavorite, removeFavorite } from '../dynamo/userData.js';

export const favoritesRouter = Router();

favoritesRouter.get('/favorites', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = req as AuthRequest;
    const favorites = await getFavorites(userId);
    res.json(favorites);
  } catch (e) {
    const err: ApiError = {
      error: 'favorites_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    res.status(500).json(err);
  }
});

favoritesRouter.post('/favorites', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest;
  const body = req.body as Record<string, unknown>;

  if (body.type !== 'charger' && body.type !== 'brand') {
    const err: ApiError = {
      error: 'invalid_request',
      details: 'type must be "charger" or "brand"',
    };
    res.status(400).json(err);
    return;
  }

  if (typeof body.id !== 'string' || body.id.length === 0) {
    const err: ApiError = {
      error: 'invalid_request',
      details: 'id must be a non-empty string',
    };
    res.status(400).json(err);
    return;
  }

  try {
    await addFavorite(userId, {
      type: body.type,
      id: body.id,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    const err: ApiError = {
      error: 'favorites_failed',
      details: e instanceof Error ? e.message : 'unknown error',
    };
    res.status(500).json(err);
  }
});

favoritesRouter.delete(
  '/favorites/:type/:id',
  requireAuth,
  async (req, res: Response) => {
    const { userId } = req as AuthRequest;
    const type = req.params.type as string;
    const id = req.params.id as string;

    if (type !== 'charger' && type !== 'brand') {
      const err: ApiError = {
        error: 'invalid_request',
        details: 'type must be "charger" or "brand"',
      };
      res.status(400).json(err);
      return;
    }

    try {
      await removeFavorite(userId, type, id);
      res.status(204).send();
    } catch (e) {
      const err: ApiError = {
        error: 'favorites_failed',
        details: e instanceof Error ? e.message : 'unknown error',
      };
      res.status(500).json(err);
    }
  },
);
