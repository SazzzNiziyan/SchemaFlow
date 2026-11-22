import { describe, it, expect } from 'vitest';
import { getMemoryStatsMb } from '../serverMetrics';

describe('Server Health and Memory Metrics', () => {
  it('computes memory metrics in MB rounded to 1 decimal place', () => {
    const stats = getMemoryStatsMb();

    expect(stats).toBeDefined();
    expect(typeof stats.rss).toBe('number');
    expect(typeof stats.heapUsed).toBe('number');
    expect(typeof stats.heapTotal).toBe('number');
    expect(typeof stats.arrayBuffers).toBe('number');

    expect(stats.rss).toBeGreaterThan(0);
    expect(stats.heapUsed).toBeGreaterThan(0);
    expect(stats.heapTotal).toBeGreaterThan(0);
    expect(stats.arrayBuffers).toBeGreaterThanOrEqual(0);

    // Verify values have at most 1 decimal digit
    const verifyDecimalPlaces = (val: number) => {
      const str = val.toString();
      const dotIndex = str.indexOf('.');
      if (dotIndex !== -1) {
        const decimals = str.slice(dotIndex + 1);
        expect(decimals.length).toBeLessThanOrEqual(1);
      }
    };

    verifyDecimalPlaces(stats.rss);
    verifyDecimalPlaces(stats.heapUsed);
    verifyDecimalPlaces(stats.heapTotal);
    verifyDecimalPlaces(stats.arrayBuffers);
  });

  it('matches the GET /health response schema contract', () => {
    const stats = getMemoryStatsMb();
    const healthPayload = {
      ok: true,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: stats,
    };

    expect(healthPayload.ok).toBe(true);
    expect(Number.isInteger(healthPayload.uptimeSec)).toBe(true);
    expect(healthPayload.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(healthPayload.memoryMb).toHaveProperty('rss');
    expect(healthPayload.memoryMb).toHaveProperty('heapUsed');
    expect(healthPayload.memoryMb).toHaveProperty('heapTotal');
    expect(healthPayload.memoryMb).toHaveProperty('arrayBuffers');
  });
});
