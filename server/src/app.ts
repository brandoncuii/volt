import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { routeRouter } from './routes/route.js';
import { placesRouter } from './routes/places.js';
import { favoritesRouter } from './routes/favorites.js';
import { tripsRouter } from './routes/trips.js';
import { ALLOWED_ORIGINS } from './config.js';

export function createApp() {
  const app = express();
  // Behind API Gateway — trust the first X-Forwarded-For hop so req.ip
  // (used by the rate limiter) is the client IP, not the gateway's.
  app.set('trust proxy', 1);
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());

  // Registered before the rate limiter so uptime monitors don't trip it.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'volt-api',
      timestamp: new Date().toISOString(),
    });
  });

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'rate_limited',
      details: 'Too many requests — try again in a minute',
    },
  });
  app.use('/api', apiLimiter);

  app.use('/api', routeRouter);
  app.use('/api', placesRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', tripsRouter);

  return app;
}
