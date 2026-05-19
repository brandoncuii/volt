import { describe, it, expect } from 'vitest';
import {
  validatePlacesRequest,
  MAX_CHARGERS_PER_REQUEST,
} from '../routes/places.js';

describe('validatePlacesRequest', () => {
  it('accepts a single id', () => {
    const result = validatePlacesRequest({ chargerIds: ['7676'] });
    expect(result).toEqual({ chargerIds: ['7676'] });
  });

  it('accepts multiple ids', () => {
    const result = validatePlacesRequest({
      chargerIds: ['7676', '3294', '7430'],
    });
    expect(typeof result).toBe('object');
  });

  it('rejects null body', () => {
    expect(validatePlacesRequest(null)).toBe('body must be a JSON object');
  });

  it('rejects non-object body', () => {
    expect(validatePlacesRequest('hello')).toBe('body must be a JSON object');
  });

  it('rejects missing chargerIds', () => {
    expect(validatePlacesRequest({})).toBe('chargerIds must be an array');
  });

  it('rejects non-array chargerIds', () => {
    expect(validatePlacesRequest({ chargerIds: '7676' })).toBe(
      'chargerIds must be an array',
    );
  });

  it('rejects empty array', () => {
    expect(validatePlacesRequest({ chargerIds: [] })).toBe(
      'chargerIds must not be empty',
    );
  });

  it('rejects array with non-string entries', () => {
    expect(validatePlacesRequest({ chargerIds: ['7676', 123] })).toBe(
      'chargerIds entries must all be strings',
    );
  });

  it('rejects more than MAX_CHARGERS_PER_REQUEST ids', () => {
    const tooMany = Array.from(
      { length: MAX_CHARGERS_PER_REQUEST + 1 },
      (_, i) => String(i),
    );
    expect(validatePlacesRequest({ chargerIds: tooMany })).toContain(
      'at most',
    );
  });

  it('accepts exactly MAX_CHARGERS_PER_REQUEST ids', () => {
    const exactly = Array.from(
      { length: MAX_CHARGERS_PER_REQUEST },
      (_, i) => String(i),
    );
    const result = validatePlacesRequest({ chargerIds: exactly });
    expect(typeof result).toBe('object');
  });
});
