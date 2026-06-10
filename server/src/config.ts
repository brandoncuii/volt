// Single source of truth for CORS / Clerk authorized origins.
// Override via a comma-separated ALLOWED_ORIGINS env var (set by the CDK stack).
const DEFAULT_ALLOWED_ORIGINS = [
  'https://volt-rust-phi.vercel.app',
  'http://localhost:5173',
];

export const ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
  : DEFAULT_ALLOWED_ORIGINS;
