import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Supercharger } from '@volt/shared';

interface RawStation {
  id: number;
  locationId: string;
  name: string;
  status: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  gps?: {
    latitude?: number;
    longitude?: number;
  };
  stallCount?: number;
  powerKilowatt?: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, 'superchargers.json');

let cached: Supercharger[] | null = null;

export function loadSuperchargers(): Supercharger[] {
  if (cached) return cached;

  const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as RawStation[];

  cached = raw
    .filter(
      (s) =>
        s.status === 'OPEN' &&
        s.address?.country === 'USA' &&
        typeof s.gps?.latitude === 'number' &&
        typeof s.gps?.longitude === 'number',
    )
    .map<Supercharger>((s) => ({
      id: String(s.id),
      name: s.name,
      location: { lat: s.gps!.latitude!, lng: s.gps!.longitude! },
      address: s.address?.street ?? '',
      city: s.address?.city,
      state: s.address?.state,
      stallCount: s.stallCount ?? 0,
      powerKW: s.powerKilowatt ?? 250,
    }));

  return cached;
}
