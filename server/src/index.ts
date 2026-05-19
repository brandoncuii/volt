import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { routeRouter } from './routes/route.js';
import { placesRouter } from './routes/places.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', details: 'Too many requests — try again in a minute' },
});
app.use('/api', apiLimiter);

// Health check — useful for confirming the server is alive
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'volt-api',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routeRouter);
app.use('/api', placesRouter);

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`⚡ Volt API running on http://localhost:${PORT}`);
});