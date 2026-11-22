/**
 * Computes Node.js process memory metrics in MB rounded to 1 decimal place.
 * Used for GET /health, interval monitoring, and low-resource profiling (512MB RAM / 0.1 CPU).
 */
export function getMemoryStatsMb() {
  const mem = process.memoryUsage();
  const toMb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;
  return {
    rss: toMb(mem.rss),
    heapUsed: toMb(mem.heapUsed),
    heapTotal: toMb(mem.heapTotal),
    arrayBuffers: toMb(mem.arrayBuffers || 0),
  };
}
