#!/usr/bin/env npx tsx
/**
 * One-time script to pre-warm the Places cache for all US Superchargers.
 *
 * Usage:
 *   # Locally (writes to places-cache.json):
 *   npx tsx server/src/scripts/warm-places-cache.ts
 *
 *   # Against DynamoDB (set PLACES_CACHE_TABLE first):
 *   PLACES_CACHE_TABLE=VoltStack-PlacesCache... npx tsx server/src/scripts/warm-places-cache.ts
 *
 * Cost: ~$0.032 per uncached charger × 2,711 chargers ≈ $87 one-time.
 * After this, all brand-filtered routes are cache hits.
 */

import { loadSuperchargers } from '../data/loader.js';
import {
  getRestaurantsForCharger,
  flushPlacesCache,
  getPlacesStats,
  resetPlacesStats,
} from '../places/placesClient.js';

const CONCURRENCY = 5; // stay well under Google's QPS limits

async function main(): Promise<void> {
  const chargers = loadSuperchargers();
  console.log(`Warming places cache for ${chargers.length} chargers...`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(
    `Target: ${process.env.PLACES_CACHE_TABLE ? 'DynamoDB (' + process.env.PLACES_CACHE_TABLE + ')' : 'local JSON file'}`,
  );
  console.log();

  resetPlacesStats();
  let processed = 0;
  let errors = 0;

  // Process chargers in batches of CONCURRENCY.
  for (let i = 0; i < chargers.length; i += CONCURRENCY) {
    const batch = chargers.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((c) => getRestaurantsForCharger(c.id, c.location)),
    );

    for (const r of results) {
      if (r.status === 'rejected') errors++;
    }

    processed += batch.length;
    const ps = getPlacesStats();

    if (processed % 50 === 0 || processed === chargers.length) {
      console.log(
        `[${processed}/${chargers.length}] mem=${ps.memHits} ddb=${ps.ddbHits} miss=${ps.misses} errors=${errors}`,
      );
    }

    // Flush file cache periodically (no-op when DynamoDB is active).
    if (processed % 100 === 0) {
      flushPlacesCache();
    }
  }

  flushPlacesCache();

  const ps = getPlacesStats();
  console.log();
  console.log('Done!');
  console.log(`  Chargers processed: ${processed}`);
  console.log(`  Cache hits (mem):   ${ps.memHits}`);
  console.log(`  Cache hits (ddb):   ${ps.ddbHits}`);
  console.log(`  API calls (miss):   ${ps.misses}`);
  console.log(`  Errors:             ${errors}`);
  console.log(
    `  Estimated cost:     $${(ps.misses * 0.032).toFixed(2)}`,
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
