import { verifyToken } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  userId: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY) {
    res
      .status(503)
      .json({ error: 'service_unavailable', details: 'Clerk not configured' });
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res
      .status(401)
      .json({ error: 'unauthorized', details: 'Missing Authorization header' });
    return;
  }

  try {
    const { sub } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      authorizedParties: [
        'https://volt-rust-phi.vercel.app',
        'http://localhost:5173',
      ],
    });
    if (!sub) {
      res.status(401).json({ error: 'unauthorized', details: 'Invalid token' });
      return;
    }
    (req as AuthRequest).userId = sub;
    next();
  } catch {
    res
      .status(401)
      .json({ error: 'unauthorized', details: 'Token verification failed' });
    return;
  }
}
