import { CACHE_EXPIRATION_MS, MAX_CACHE_SIZE, FETCH_TIMEOUT_MS } from '../constants';

describe('voice constants', () => {
  it('defines CACHE_EXPIRATION_MS as 2 hours in milliseconds', () => {
    expect(CACHE_EXPIRATION_MS).toBe(2 * 60 * 60 * 1000); // 7200000
  });

  it('defines MAX_CACHE_SIZE as 500', () => {
    expect(MAX_CACHE_SIZE).toBe(500);
  });

  it('defines FETCH_TIMEOUT_MS as 10 seconds in milliseconds', () => {
    expect(FETCH_TIMEOUT_MS).toBe(10000);
  });

  it('CACHE_EXPIRATION_MS is a positive number', () => {
    expect(CACHE_EXPIRATION_MS).toBeGreaterThan(0);
  });

  it('MAX_CACHE_SIZE is a positive number', () => {
    expect(MAX_CACHE_SIZE).toBeGreaterThan(0);
  });

  it('FETCH_TIMEOUT_MS is a positive number', () => {
    expect(FETCH_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
