import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routeRouter } from './routes/route.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check — useful for confirming the server is alive
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'volt-api',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routeRouter);

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`⚡ Volt API running on http://localhost:${PORT}`);
});