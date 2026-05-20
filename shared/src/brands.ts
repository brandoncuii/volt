import type { Restaurant } from './types';

export interface Brand {
  id: string;
  name: string;
  // Case-insensitive regex matched against Restaurant.name.
  pattern: RegExp;
}

// Curated list of common chains people road-trip toward. Order = display order.
export const BRANDS: Brand[] = [
  { id: 'in-n-out', name: 'In-N-Out', pattern: /in[\s.-]*n[\s.-]*out/i },
  { id: 'chick-fil-a', name: 'Chick-fil-A', pattern: /chick[\s.-]*fil[\s.-]*a/i },
  { id: 'chipotle', name: 'Chipotle', pattern: /chipotle/i },
  { id: 'starbucks', name: 'Starbucks', pattern: /starbucks/i },
  { id: 'mcdonalds', name: "McDonald's", pattern: /mcdonald/i },
  { id: 'taco-bell', name: 'Taco Bell', pattern: /taco\s*bell/i },
  { id: 'five-guys', name: 'Five Guys', pattern: /five\s*guys/i },
  { id: 'shake-shack', name: 'Shake Shack', pattern: /shake\s*shack/i },
  { id: 'panera', name: 'Panera', pattern: /panera/i },
  { id: 'subway', name: 'Subway', pattern: /\bsubway\b/i },
];

export function findBrand(id: string): Brand | undefined {
  return BRANDS.find((b) => b.id === id);
}

export function restaurantMatchesAnyBrand(
  restaurant: Restaurant,
  brands: Brand[],
): boolean {
  if (brands.length === 0) return false;
  return brands.some((b) => b.pattern.test(restaurant.name));
}

export function chargerSatisfiesBrands(
  restaurants: Restaurant[] | undefined,
  brands: Brand[],
): boolean {
  if (brands.length === 0) return true;
  if (!restaurants || restaurants.length === 0) return false;
  return restaurants.some((r) => restaurantMatchesAnyBrand(r, brands));
}
